/** Secret Santa — draw names on this device, hand each person a private link that only reveals their own match. */

export type SantaMember = { name: string; address: string; wish?: string }
export type SantaGroup = {
  id: string
  name: string
  budget: string
  date: string // yyyy-mm-dd exchange day
  created: number
  organizer: string
  members: SantaMember[]
  /** pairs[i] = index of the person member i gives to. Empty until drawn. */
  pairs: number[]
}
/** What a single private link carries. */
export type SantaTicket = { g: string; b: string; d: string; o: string; f: string; t: string; a: string; w?: string; c: number }

const GROUPS_KEY = 'mk.santa.groups.v1'
const TICKETS_KEY = 'mk.santa.tickets.v1'

const read = <T,>(key: string, fallback: T): T => {
  try { const v = JSON.parse(localStorage.getItem(key) ?? 'null'); return v ?? fallback } catch { return fallback }
}
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage blocked */ } }

export const loadGroups = (): SantaGroup[] => {
  const v = read<SantaGroup[]>(GROUPS_KEY, [])
  return Array.isArray(v) ? v.filter((g) => g && Array.isArray(g.members)) : []
}
export const saveGroups = (groups: SantaGroup[]) => write(GROUPS_KEY, groups.slice(0, 30))

export const loadTickets = (): SantaTicket[] => {
  const v = read<SantaTicket[]>(TICKETS_KEY, [])
  return Array.isArray(v) ? v.filter((t) => t && typeof t.t === 'string') : []
}
export function rememberTicket(t: SantaTicket) {
  const all = loadTickets().filter((x) => !(x.g === t.g && x.f === t.f && x.c === t.c))
  write(TICKETS_KEY, [t, ...all].slice(0, 20))
}

/** Everyone gives to the next person in a shuffled circle — nobody draws themselves. */
export function drawPairs(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const r = new Uint32Array(1)
    crypto.getRandomValues(r)
    const j = r[0] % (i + 1);
    [order[i], order[j]] = [order[j], order[i]]
  }
  const pairs = Array<number>(n)
  order.forEach((giver, k) => { pairs[giver] = order[(k + 1) % n] })
  return pairs
}

const toB64Url = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function ticketFor(group: SantaGroup, giver: number): SantaTicket {
  const to = group.members[group.pairs[giver]]
  return { g: group.name, b: group.budget, d: group.date, o: group.organizer, f: group.members[giver].name, t: to.name, a: to.address, ...(to.wish ? { w: to.wish } : {}), c: group.created }
}

export function ticketLink(ticket: SantaTicket): string {
  const base = typeof window === 'undefined' ? 'https://makotowallet.xyz/' : `${window.location.origin}${window.location.pathname}`
  return `${base}#santa-${toB64Url(JSON.stringify(ticket))}`
}

export const SANTA_HASH = /^#?santa-[A-Za-z0-9_-]{20,4000}$/

export function parseTicketHash(hash: string): SantaTicket | null {
  if (!SANTA_HASH.test(hash)) return null
  try {
    const t = JSON.parse(fromB64Url(hash.replace(/^#?santa-/, ''))) as SantaTicket
    if (typeof t?.f !== 'string' || typeof t?.t !== 'string' || typeof t?.a !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(t.a)) return null
    const s = (v: unknown, n: number) => String(v ?? '').slice(0, n)
    return { g: s(t.g, 60), b: s(t.b, 12), d: s(t.d, 10), o: s(t.o, 40), f: s(t.f, 40), t: s(t.t, 40), a: t.a, ...(t.w ? { w: s(t.w, 140) } : {}), c: Number(t.c) || 0 }
  } catch { return null }
}
