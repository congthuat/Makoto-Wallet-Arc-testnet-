import { useMemo, useState } from 'react'
import { Check, Copy, Link2, Plus, ReceiptText, Trash2, Users, Zap } from 'lucide-react'
import type { Address, Hex } from 'viem'
import { useWallet } from '../lib/store'
import { useT } from '../lib/i18n'
import { TOKENS, getProvider, isAddress, short } from '../lib/wallet'
import { Avatar, Badge, Button, Card, Field, PageHeader, T, inputCls } from '../components/wallet/ui'
import { encodeTransfer, formatSendAmount, parseSendAmount } from '../lib/sendExecution'
import { ARC_BATCH_ADDRESS, ARC_MEMO_ADDRESS, MAX_MEMO_BYTES, batchCallData, cleanMemo, limitMemoInput, memoBytes, memoCall } from '../lib/arcMemo'
import { configuredPayAddress, createData, createdRequestId, formatUnitsText, payLink, prepareTx, rememberMyRequest, sendPrepared, waitForReceipt } from '../lib/payRequests'
import { TxPanel, useReviewedWrite } from './PayRequests'

const L = (vi: boolean, en: string, viText: string) => (vi ? viText : en)
const USDC = TOKENS[0]
const MAX_PEOPLE = 100

type PayRow = { key: string; to: string; amount: string }
const rowKey = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

/**
 * Two ways to settle a group bill:
 *  1. Collect — one payment request, several payers, each pays their share to you.
 *  2. Pay out — one wallet signature that sends to every recipient at once
 *     through Arc's Multicall3From precompile (atomic: all or nothing).
 */
export default function SplitPage() {
  const [, lang] = useT()
  const vi = lang === 'vi'
  const w = useWallet()
  const [mode, setMode] = useState<'collect' | 'pay'>('collect')

  return (
    <>
      <PageHeader title={L(vi, 'Split a bill', 'Chia tiền nhóm')} desc={L(vi, 'Collect from friends, or pay everyone in a single signature.', 'Thu tiền từ bạn bè, hoặc trả cho tất cả mọi người chỉ với một chữ ký.')} />
      <div className="max-w-[760px] space-y-4">
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
          {([['collect', L(vi, 'Collect from friends', 'Thu tiền từ bạn bè'), ReceiptText], ['pay', L(vi, 'Pay everyone at once', 'Trả nhiều người một lần'), Zap]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setMode(id)} className={`flex items-center justify-center gap-2 h-11 rounded-xl text-[13px] font-semibold transition ${mode === id ? 'bg-neon-500 text-[#0b0b10]' : `${T.sub} hover:bg-white/[0.05]`}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        {mode === 'collect' ? <CollectCard vi={vi} /> : <PayAllCard vi={vi} />}
        {w.mode !== 'connected' && (
          <p className={`text-[12px] ${T.mute}`}>{L(vi, 'Connect your wallet to create a request or send a batch.', 'Kết nối ví để tạo yêu cầu hoặc gửi một lần cho nhiều người.')}</p>
        )}
      </div>
    </>
  )
}

// ------------------------------------------------------------------ collect

function CollectCard({ vi }: { vi: boolean }) {
  const w = useWallet()
  const write = useReviewedWrite()
  const [total, setTotal] = useState('')
  const [people, setPeople] = useState('2')
  const [note, setNote] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ id: bigint; per: string; people: number } | null>(null)
  const [copied, setCopied] = useState('')

  const contract = useMemo(() => configuredPayAddress(), [])
  const count = picked.length > 0 ? picked.length : Number(people)
  const totalUnits = (() => { try { return total.trim() ? parseSendAmount(total.trim(), 6) : undefined } catch { return undefined } })()
  const perUnits = totalUnits && Number.isInteger(count) && count > 0 && count <= MAX_PEOPLE ? totalUnits / BigInt(count) : undefined
  const perLabel = perUnits ? formatUnitsText(perUnits, 6) : ''
  const remainder = totalUnits && perUnits ? totalUnits - perUnits * BigInt(count) : 0n

  const toggle = (address: string) => setPicked((old) => old.includes(address) ? old.filter((a) => a !== address) : [...old, address])

  const start = async () => {
    setError('')
    if (!contract) { setError(L(vi, 'Deploy the payment-request contract first.', 'Hãy deploy hợp đồng yêu cầu thanh toán trước.')); return }
    if (!perUnits || perUnits <= 0n) { setError(L(vi, 'Enter a total amount and at least one person.', 'Nhập tổng tiền và ít nhất một người.')); return }
    if (!Number.isInteger(count) || count < 1 || count > MAX_PEOPLE) { setError(L(vi, 'Use between 1 and 100 people.', 'Số người phải từ 1 đến 100.')); return }
    const p = getProvider()
    if (!p || w.mode !== 'connected') { setError(L(vi, 'Connect your wallet first.', 'Hãy kết nối ví trước.')); return }
    try {
      const expiresAt = Math.floor(Date.now() / 1000) + 7 * 86_400
      const tx = await prepareTx(p, w.address as Address, contract, createData({ token: 'USDC', amount: perUnits, maxPayments: count, allowedPayer: null, expiresAt, memo: cleanMemo(note) }))
      write.review({
        label: L(vi,
          `Split bill: ${count} people × ${perLabel} USDC, each pays you directly.`,
          `Chia hoá đơn: ${count} người × ${perLabel} USDC, mỗi người trả thẳng cho bạn.`),
        tx,
        onConfirmed: (receipt) => {
          const id = createdRequestId(receipt, contract, w.address as Address)
          if (id === null) return false
          rememberMyRequest(w.address, id)
          setCreated({ id, per: perLabel, people: count })
          return true
        },
      })
    } catch (caught) { setError(caught instanceof Error ? caught.message : L(vi, 'Could not prepare the request.', 'Không chuẩn bị được yêu cầu.')) }
  }

  const copy = async (text: string, key: string) => {
    if (!await copyText(text)) return
    setCopied(key)
    window.setTimeout(() => setCopied((current) => current === key ? '' : current), 1_600)
  }

  const link = created ? payLink(created.id) : ''

  return (
    <>
      <Card className="p-5 sm:p-6 space-y-4">
        <p className={`text-[13px] ${T.sub}`}>{L(vi, 'Enter the total, choose how many people share it, and send one link. Every friend pays their own share straight to your wallet.', 'Nhập tổng tiền, chọn số người cùng chia, rồi gửi một link. Mỗi người trả phần của mình thẳng vào ví bạn.')}</p>

        <Field label={L(vi, 'Total amount (USDC)', 'Tổng tiền (USDC)')} hint={remainder > 0n ? L(vi, `Rounded down per person; ${formatUnitsText(remainder, 6)} USDC is not collected.`, `Làm tròn xuống mỗi người; ${formatUnitsText(remainder, 6)} USDC không được thu.`) : undefined}>
          <input value={total} onChange={(e) => { setTotal(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')); setCreated(null) }} inputMode="decimal" placeholder="0.00" className={`${inputCls} h-12 text-[18px] font-semibold tabular-nums`} />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <Field label={L(vi, 'People', 'Số người')}>
            <input value={picked.length > 0 ? String(picked.length) : people} onChange={(e) => { setPeople(e.target.value.replace(/[^0-9]/g, '')); setCreated(null) }} inputMode="numeric" disabled={picked.length > 0} className={`${inputCls} h-11 tabular-nums`} />
          </Field>
          <div className="pb-0.5">
            <div className={`text-[11.5px] ${T.mute}`}>{L(vi, 'Each person pays', 'Mỗi người trả')}</div>
            <div className="text-[18px] font-bold tabular-nums">{perLabel || '—'} USDC</div>
          </div>
        </div>

        {w.contacts.length > 0 && (
          <div>
            <div className={`mb-1.5 text-[11.5px] font-semibold ${T.mute}`}><Users size={12} className="inline mr-1" />{L(vi, 'Pick people from your contacts (optional)', 'Chọn người từ danh bạ (không bắt buộc)')}</div>
            <div className="flex flex-wrap gap-1.5">
              {w.contacts.map((c) => {
                const on = picked.includes(c.address)
                return (
                  <button key={c.address} onClick={() => { toggle(c.address); setCreated(null) }} className={`inline-flex items-center gap-1.5 h-8 pl-1.5 pr-2.5 rounded-full border text-[12.5px] transition ${on ? 'border-neon-400/60 bg-neon-500/10 text-white' : 'border-white/[0.09] bg-white/[0.02] text-[#c9c9d2] hover:bg-white/[0.06]'}`}>
                    <Avatar size={20} seed={c.address} emoji={c.emoji} tone={c.tone} photo={c.photo} />
                    <span className="max-w-[120px] truncate">{c.name}</span>
                    {on && <Check size={12} className="text-neon-300" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <Field label={L(vi, 'Note for the group (optional)', 'Lời nhắn cho cả nhóm (không bắt buộc)')} right={<span className={`text-[11.5px] tabular-nums ${memoBytes(note) > MAX_MEMO_BYTES ? 'text-rose-300' : T.mute}`}>{memoBytes(note)}/{MAX_MEMO_BYTES}</span>}>
          <input value={note} onChange={(e) => setNote(limitMemoInput(e.target.value))} placeholder={L(vi, 'e.g. Dinner on Saturday', 'ví dụ: Ăn tối thứ Bảy')} className={`${inputCls} text-[13px]`} />
        </Field>

        {!contract && <p className="text-[12.5px] text-amber-200/90">{L(vi, 'The payment-request contract is not deployed on this device yet. Open Payment requests to deploy it once.', 'Hợp đồng yêu cầu thanh toán chưa được deploy trên thiết bị này. Mở trang Yêu cầu thanh toán để deploy một lần.')}</p>}
        {error && <p className="text-[12.5px] text-rose-300">{error}</p>}
        <Button variant="primary" className="w-full" disabled={!contract || !perUnits || perUnits <= 0n || write.phase.kind === 'wallet' || write.phase.kind === 'pending'} onClick={() => void start()}>
          <ReceiptText size={15} /> {L(vi, 'Create the split request', 'Tạo yêu cầu chia tiền')}
        </Button>
        <TxPanel vi={vi} phase={write.phase} onCancel={() => write.setPhase({ kind: 'idle' })} onConfirm={() => write.phase.kind === 'review' && void write.confirm(write.phase.step, L(vi, 'Split request created.', 'Đã tạo yêu cầu chia tiền.'))} />
      </Card>

      {created && (
        <Card className="p-5 sm:p-6 mt-4 border-neon-500/30 bg-neon-500/[0.04] mk-in">
          <div className="flex items-center gap-2 font-semibold text-neon-200"><Check size={16} /> {L(vi, 'Ready to send', 'Sẵn sàng gửi')}</div>
          <p className={`mt-1 text-[13px] ${T.sub}`}>{L(vi, `${created.people} people × ${created.per} USDC. Share this link with the group.`, `${created.people} người × ${created.per} USDC. Gửi link này cho cả nhóm.`)}</p>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/30 p-2">
            <Link2 size={14} className={T.mute} />
            <span className="flex-1 min-w-0 truncate font-mono text-[12px]" data-split-link>{link}</span>
            <Button size="sm" onClick={() => void copy(link, 'group')}>{copied === 'group' ? <Check size={13} /> : <Copy size={13} />} {copied === 'group' ? L(vi, 'Copied', 'Đã chép') : L(vi, 'Copy', 'Chép')}</Button>
          </div>
          {picked.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className={`text-[11.5px] font-semibold ${T.mute}`}>{L(vi, 'Personal message for each person', 'Tin nhắn riêng cho từng người')}</div>
              {w.contacts.filter((c) => picked.includes(c.address)).map((c) => {
                const message = L(vi,
                  `Hi ${c.name}, your share is ${created.per} USDC. Pay here: ${link}`,
                  `${c.name} ơi, phần của bạn là ${created.per} USDC. Trả tại đây: ${link}`)
                return (
                  <div key={c.address} className="flex items-center gap-2 rounded-xl border border-white/[0.07] p-2">
                    <Avatar size={24} seed={c.address} emoji={c.emoji} tone={c.tone} photo={c.photo} />
                    <span className="flex-1 min-w-0 truncate text-[12.5px]">{c.name}</span>
                    <Button size="sm" onClick={() => void copy(message, c.address)}>{copied === c.address ? <Check size={13} /> : <Copy size={13} />} {copied === c.address ? L(vi, 'Copied', 'Đã chép') : L(vi, 'Copy', 'Chép')}</Button>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}
    </>
  )
}

// ------------------------------------------------------------------ pay everyone

function PayAllCard({ vi }: { vi: boolean }) {
  const w = useWallet()
  const write = useReviewedWrite()
  const [rows, setRows] = useState<PayRow[]>([{ key: rowKey(), to: '', amount: '' }])
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<Hex | null>(null)

  const usdcBalance = w.holdings.find((h) => h.symbol === 'USDC')?.balance ?? 0

  const parsed = rows.map((row) => {
    const to = row.to.trim()
    const valid = isAddress(to)
    let units: bigint | undefined
    try { units = row.amount.trim() ? parseSendAmount(row.amount.trim(), 6) : undefined } catch { units = undefined }
    return { ...row, to, valid, units }
  })
  const ready = parsed.length > 0 && parsed.every((r) => r.valid && !!r.units && r.units > 0n && r.to.toLowerCase() !== w.address.toLowerCase())
  const totalUnits = parsed.reduce((sum, r) => sum + (r.units ?? 0n), 0n)
  const totalText = formatSendAmount(totalUnits, 6)
  const overBalance = Number(totalText) > usdcBalance

  const update = (key: string, patch: Partial<PayRow>) => { setRows((old) => old.map((r) => r.key === key ? { ...r, ...patch } : r)); setDone(null) }
  const addRow = () => setRows((old) => [...old.slice(0, 19), { key: rowKey(), to: '', amount: '' }])
  const removeRow = (key: string) => setRows((old) => old.length === 1 ? old : old.filter((r) => r.key !== key))

  const start = async () => {
    setError('')
    if (!ready || overBalance) { setError(L(vi, 'Check every address and amount first.', 'Hãy kiểm tra lại địa chỉ và số tiền.')); return }
    const p = getProvider()
    if (!p || w.mode !== 'connected') { setError(L(vi, 'Connect your wallet first.', 'Hãy kết nối ví trước.')); return }
    try {
      const calls = parsed.map((r) => ({ target: USDC.address as Address, callData: encodeTransfer(r.to, r.units as bigint) as Hex }))
      const batch = batchCallData(calls)
      const text = cleanMemo(note)
      const to = text ? ARC_MEMO_ADDRESS : ARC_BATCH_ADDRESS
      const data = text ? memoCall(ARC_BATCH_ADDRESS, batch, text) : batch
      const tx = await prepareTx(p, w.address as Address, to, data)
      write.review({
        label: L(vi,
          `Pay ${parsed.length} people in one signature: ${totalText} USDC total. Atomic — if one transfer fails, nothing is sent.`,
          `Trả cho ${parsed.length} người trong một chữ ký: tổng ${totalText} USDC. Toàn bộ hoặc không gì cả — nếu một người lỗi, cả lệnh không gửi.`),
        tx,
        onConfirmed: () => true,
      })
    } catch (caught) { setError(caught instanceof Error ? caught.message : L(vi, 'Could not prepare the payment.', 'Không chuẩn bị được giao dịch.')) }
  }

  const confirm = async () => {
    if (write.phase.kind !== 'review') return
    const step = write.phase.step
    const p = getProvider()
    if (!p) { setError(L(vi, 'Wallet unavailable.', 'Ví không khả dụng.')); return }
    write.setPhase({ kind: 'wallet' })
    let hash: Hex
    try { hash = await sendPrepared(p, step.tx) } catch (caught) {
      write.setPhase({ kind: 'error', message: caught instanceof Error ? caught.message : L(vi, 'Wallet request failed.', 'Yêu cầu trong ví thất bại.') })
      return
    }
    write.setPhase({ kind: 'pending', hash })
    const outcome = await waitForReceipt(hash)
    if (outcome.status !== 'confirmed') {
      write.setPhase({ kind: 'error', hash, message: outcome.status === 'failed' ? L(vi, 'The batch failed on-chain; nobody was paid.', 'Lệnh bị lỗi trên chuỗi; không ai được trả.') : L(vi, 'Status unknown — check the explorer.', 'Chưa rõ trạng thái — hãy kiểm tra trên explorer.') })
      return
    }
    setDone(hash)
    write.setPhase({ kind: 'done', hash, message: L(vi, `Paid ${parsed.length} people in one transaction.`, `Đã trả ${parsed.length} người trong một giao dịch.`) })
    await w.refetchWallet()
  }

  return (
    <>
      <Card className="p-5 sm:p-6 space-y-4">
        <p className={`text-[13px] ${T.sub}`}>{L(vi, 'Each row is one USDC transfer. Your wallet asks once and every transfer happens together on Arc.', 'Mỗi dòng là một lần chuyển USDC. Ví chỉ hỏi bạn một lần và tất cả được gửi cùng lúc trên Arc.')}</p>

        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={row.key} className="grid grid-cols-[1fr_110px_auto] gap-2 items-center">
              <div>
                <input
                  value={row.to}
                  onChange={(e) => update(row.key, { to: e.target.value })}
                  placeholder={L(vi, '0x… address', 'Địa chỉ 0x…')}
                  spellCheck={false}
                  list={`split-contacts-${index}`}
                  className={`${inputCls} h-10 font-mono text-[12px] ${row.to && !isAddress(row.to) ? '!border-rose-400/60' : ''}`}
                />
                <datalist id={`split-contacts-${index}`}>
                  {w.contacts.map((c) => <option key={c.address} value={c.address}>{c.name}</option>)}
                </datalist>
                {(() => {
                  const contact = w.contacts.find((c) => c.address.toLowerCase() === row.to.trim().toLowerCase())
                  return contact ? <div className={`mt-1 text-[11px] ${T.mute}`}>{contact.emoji ? `${contact.emoji} ` : ''}{contact.name}</div> : null
                })()}
              </div>
              <input value={row.amount} onChange={(e) => update(row.key, { amount: e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1') })} inputMode="decimal" placeholder="0.00" className={`${inputCls} h-10 tabular-nums text-[13px]`} />
              <button onClick={() => removeRow(row.key)} disabled={rows.length === 1} aria-label={L(vi, 'Remove row', 'Xoá dòng')} className={`p-2 rounded-lg ${T.mute} hover:text-rose-300 hover:bg-rose-500/10 disabled:opacity-30`}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <Button size="sm" onClick={addRow} disabled={rows.length >= 20}><Plus size={14} /> {L(vi, 'Add person', 'Thêm người')}</Button>
          <div className="text-right">
            <div className={`text-[11.5px] ${T.mute}`}>{L(vi, 'Total', 'Tổng')}</div>
            <div className={`text-[16px] font-bold tabular-nums ${overBalance ? 'text-rose-300' : ''}`}>{totalText} USDC</div>
          </div>
        </div>

        {w.contacts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {w.contacts.slice(0, 8).map((c) => (
              <button key={c.address} onClick={() => {
                const empty = rows.find((r) => !r.to.trim())
                if (empty) update(empty.key, { to: c.address })
                else if (rows.length < 20) setRows((old) => [...old, { key: rowKey(), to: c.address, amount: '' }])
              }} className="inline-flex items-center gap-1.5 h-8 pl-1.5 pr-2.5 rounded-full border border-white/[0.09] bg-white/[0.02] text-[12.5px] hover:bg-white/[0.06]">
                <Avatar size={20} seed={c.address} emoji={c.emoji} tone={c.tone} photo={c.photo} /><span className="max-w-[110px] truncate">{c.name}</span>
              </button>
            ))}
          </div>
        )}

        <Field label={L(vi, 'Note (optional)', 'Ghi chú (không bắt buộc)')} right={<span className={`text-[11.5px] tabular-nums ${memoBytes(note) > MAX_MEMO_BYTES ? 'text-rose-300' : T.mute}`}>{memoBytes(note)}/{MAX_MEMO_BYTES}</span>}>
          <input value={note} onChange={(e) => setNote(limitMemoInput(e.target.value))} placeholder={L(vi, 'e.g. Team lunch', 'ví dụ: Ăn trưa nhóm')} className={`${inputCls} text-[13px]`} />
        </Field>

        {overBalance && <p className="text-[12.5px] text-rose-300">{L(vi, `Not enough USDC. Balance: ${usdcBalance.toFixed(6)}.`, `Không đủ USDC. Số dư: ${usdcBalance.toFixed(6)}.`)}</p>}
        {error && <p className="text-[12.5px] text-rose-300">{error}</p>}

        <Button variant="primary" className="w-full" disabled={!ready || overBalance || write.phase.kind === 'wallet' || write.phase.kind === 'pending'} onClick={() => void start()}>
          <Zap size={15} /> {L(vi, 'Review the batch', 'Xem lại lệnh gửi')}
        </Button>

        {write.phase.kind === 'review' && <TxPanel vi={vi} phase={write.phase} onCancel={() => write.setPhase({ kind: 'idle' })} onConfirm={() => void confirm()} />}
        {(write.phase.kind === 'wallet' || write.phase.kind === 'pending' || write.phase.kind === 'done' || write.phase.kind === 'error') && (
          <TxPanel vi={vi} phase={write.phase} onCancel={() => write.setPhase({ kind: 'idle' })} onConfirm={() => void confirm()} />
        )}
        {done && <div className="flex items-center gap-2 text-[12.5px] text-neon-200"><Badge tone="ok">{L(vi, 'Paid', 'Đã trả')}</Badge> {short(done)}</div>}
      </Card>
      <p className={`mt-3 text-[11.5px] ${T.mute}`}>{L(vi, 'Uses Arc’s Multicall3From precompile. All transfers succeed together or the whole batch is rejected.', 'Dùng hợp đồng Multicall3From của Arc. Tất cả chuyển khoản cùng thành công hoặc cả lệnh bị hủy.')}</p>
    </>
  )
}
