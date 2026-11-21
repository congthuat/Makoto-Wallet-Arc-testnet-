/** "Your year on Makoto" — real wallet history from the Arc explorer, summarised. */

const EXPLORER_API = 'https://explorer.testnet.arc.io/api/v2'
const STABLES: Record<string, 'USDC' | 'EURC'> = {
  '0x3600000000000000000000000000000000000000': 'USDC',
  '0x89b50855aa3be2f677cd6303cec089b5f319d72a': 'EURC',
}
const MAX_PAGES = 30

export type Transfer = { hash: string; time: number; direction: 'in' | 'out'; counterparty: string; symbol: 'USDC' | 'EURC'; amount: number }

type RawTransfer = {
  transaction_hash?: string
  timestamp?: string
  from?: { hash?: string }
  to?: { hash?: string }
  token?: { address_hash?: string; address?: string }
  total?: { value?: string; decimals?: string | number }
}

function parseTransfer(raw: RawTransfer, me: string): Transfer | null {
  const token = (raw.token?.address_hash ?? raw.token?.address ?? '').toLowerCase()
  const symbol = STABLES[token]
  const from = raw.from?.hash?.toLowerCase()
  const to = raw.to?.hash?.toLowerCase()
  const time = raw.timestamp ? Date.parse(raw.timestamp) : NaN
  if (!symbol || !from || !to || !raw.transaction_hash || !Number.isFinite(time)) return null
  if (from === to) return null
  const direction = from === me ? 'out' : to === me ? 'in' : null
  if (!direction) return null
  const decimals = Number(raw.total?.decimals ?? 6)
  const amount = Number(raw.total?.value ?? '0') / 10 ** (Number.isFinite(decimals) ? decimals : 6)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return { hash: raw.transaction_hash, time, direction, counterparty: direction === 'out' ? raw.to!.hash! : raw.from!.hash!, symbol, amount }
}

/** Pages through the explorer until the start of `year` (USDC + EURC only, spam ignored). */
export async function fetchYearTransfers(address: string, year: number, signal?: AbortSignal): Promise<Transfer[]> {
  const me = address.toLowerCase()
  const start = new Date(year, 0, 1).getTime()
  const end = new Date(year + 1, 0, 1).getTime()
  const out: Transfer[] = []
  let params: Record<string, string | number> | null = {}
  for (let page = 0; page < MAX_PAGES && params; page++) {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
    const res = await fetch(`${EXPLORER_API}/addresses/${address}/token-transfers${qs ? `?${qs}` : ''}`, { signal, headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`Explorer ${res.status}`)
    const data = await res.json() as { items?: RawTransfer[]; next_page_params?: Record<string, string | number> | null }
    const items = Array.isArray(data.items) ? data.items : []
    let oldest = Infinity
    for (const raw of items) {
      const t = parseTransfer(raw, me)
      const time = raw.timestamp ? Date.parse(raw.timestamp) : NaN
      if (Number.isFinite(time)) oldest = Math.min(oldest, time)
      if (t && t.time >= start && t.time < end) out.push(t)
    }
    if (!items.length || oldest < start) break
    params = data.next_page_params ?? null
  }
  return out
}

export type Persona = { id: string; emoji: string; title: string; titleVi: string; desc: string; descVi: string }

export type YearStats = {
  year: number
  txCount: number
  activeDays: number
  sentCount: number
  receivedCount: number
  sent: { USDC: number; EURC: number }
  received: { USDC: number; EURC: number }
  people: number
  topFriend: { address: string; count: number; total: number } | null
  biggest: { amount: number; symbol: string; to: string; time: number } | null
  months: number[]
  busiestMonth: number
  busiestDay: { time: number; count: number } | null
  firstTime: number | null
  swaps: number
  bridges: number
  notes: number
  persona: Persona
}

const PERSONAS: Record<string, Persona> = {
  explorer: { id: 'explorer', emoji: '🌉', title: 'The chain explorer', titleVi: 'Nhà du hành đa chuỗi', desc: 'You moved money across chains like it was nothing.', descVi: 'Bạn chuyển tiền qua lại giữa các chuỗi như đi chợ.' },
  connector: { id: 'connector', emoji: '🤝', title: 'The connector', titleVi: 'Người kết nối', desc: 'Your wallet is a little social network of its own.', descVi: 'Ví của bạn là cả một mạng lưới bạn bè thu nhỏ.' },
  generous: { id: 'generous', emoji: '🎁', title: 'The generous one', titleVi: 'Người hào phóng', desc: 'You gave more than you got — your friends are lucky.', descVi: 'Bạn cho đi nhiều hơn nhận về — bạn bè bạn thật may mắn.' },
  collector: { id: 'collector', emoji: '💎', title: 'The collector', titleVi: 'Người tích lũy', desc: 'Money found its way to you, and it stayed.', descVi: 'Tiền tự tìm đến bạn, và ở lại.' },
  trader: { id: 'trader', emoji: '🔁', title: 'The trader', titleVi: 'Nhà giao dịch', desc: 'USDC, EURC, back again — you kept things moving.', descVi: 'USDC, EURC, rồi lại USDC — bạn luôn bận rộn.' },
  steady: { id: 'steady', emoji: '⚖️', title: 'The steady hand', titleVi: 'Người điềm tĩnh', desc: 'Balanced, calm and always on time.', descVi: 'Cân bằng, bình tĩnh và luôn đúng hẹn.' },
  newcomer: { id: 'newcomer', emoji: '🌱', title: 'The newcomer', titleVi: 'Người mới chớm nở', desc: 'Your story on Arc is just getting started.', descVi: 'Câu chuyện của bạn trên Arc chỉ mới bắt đầu.' },
}

const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }

export function summarizeYear(year: number, transfers: Transfer[], extra: { swaps: number; bridges: number; notes: number }): YearStats {
  const hashes = new Set<string>()
  const days = new Map<string, { time: number; count: number }>()
  const months = Array<number>(12).fill(0)
  const sent = { USDC: 0, EURC: 0 }
  const received = { USDC: 0, EURC: 0 }
  const friends = new Map<string, { address: string; count: number; total: number }>()
  let sentCount = 0
  let receivedCount = 0
  let biggest: YearStats['biggest'] = null
  let firstTime: number | null = null

  for (const t of transfers) {
    const newTx = !hashes.has(t.hash)
    hashes.add(t.hash)
    if (newTx) {
      months[new Date(t.time).getMonth()]++
      const k = dayKey(t.time)
      const day = days.get(k) ?? { time: t.time, count: 0 }
      day.count++
      days.set(k, day)
    }
    firstTime = firstTime === null ? t.time : Math.min(firstTime, t.time)
    if (t.direction === 'out') {
      sentCount++
      sent[t.symbol] += t.amount
      const key = t.counterparty.toLowerCase()
      const f = friends.get(key) ?? { address: t.counterparty, count: 0, total: 0 }
      f.count++
      if (t.symbol === 'USDC') f.total += t.amount
      friends.set(key, f)
      if (!biggest || t.amount > biggest.amount) biggest = { amount: t.amount, symbol: t.symbol, to: t.counterparty, time: t.time }
    } else {
      receivedCount++
      received[t.symbol] += t.amount
    }
  }

  const topFriend = [...friends.values()].sort((a, b) => b.count - a.count || b.total - a.total)[0] ?? null
  const busiestDay = [...days.values()].sort((a, b) => b.count - a.count)[0] ?? null
  const busiestMonth = months.indexOf(Math.max(...months))
  const txCount = hashes.size
  const outTotal = sent.USDC + sent.EURC
  const inTotal = received.USDC + received.EURC
  const persona =
    txCount < 3 ? PERSONAS.newcomer
      : extra.bridges >= 3 ? PERSONAS.explorer
        : friends.size >= 5 ? PERSONAS.connector
          : extra.swaps >= 3 ? PERSONAS.trader
            : outTotal > inTotal * 1.5 ? PERSONAS.generous
              : inTotal > outTotal * 1.5 ? PERSONAS.collector
                : PERSONAS.steady

  return { year, txCount, activeDays: days.size, sentCount, receivedCount, sent, received, people: friends.size, topFriend, biggest, months, busiestMonth, busiestDay, firstTime, swaps: extra.swaps, bridges: extra.bridges, notes: extra.notes, persona }
}
