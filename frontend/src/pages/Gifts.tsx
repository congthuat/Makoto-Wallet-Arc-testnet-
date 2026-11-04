import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle2, Copy, ExternalLink, Fuel, Gift as GiftIcon, Loader2, Rocket, Share2, ShieldAlert, Sparkles, Users, Wallet, XCircle } from 'lucide-react'
import type { Address, Hex } from 'viem'
import { useWallet } from '../lib/store'
import { useT } from '../lib/i18n'
import { SuccessBurst } from '../components/wallet/SuccessBurst'
import { ConnectModal } from '../components/wallet/shared'
import { ARC, getProvider, short } from '../lib/wallet'
import { Badge, Button, Card, Field, PageHeader, T, inputCls } from '../components/wallet/ui'
import { TxPanel, useReviewedWrite } from './PayRequests'
import { approveData, formatUnitsText, prepareTx, readAllowanceUnits, readTokenUnits, waitForReceipt, PAY_TOKENS, type PayToken } from '../lib/payRequests'
import {
  CREATE2_PROXY, GIFTS_ADDRESS, MAX_SHARES, claimData, claimSignature, claimedAmount, createGiftData, createdGiftId, giftFromHash, giftLink, giftsDeployData, giftsDeployed,
  linkSigner, myGifts, newLinkKey, parseUnitsText, readGift, refundData, refundedMatches, relayClaim, relayerStatus, rememberMyGift, splitEqual, splitRandom,
  type Gift, type RelayerStatus,
} from '../lib/gifts'

const L = (vi: boolean, en: string, viText: string) => (vi ? viText : en)
const amountOf = (value: bigint, token: PayToken) => `${formatUnitsText(value, PAY_TOKENS[token].decimals)} ${token}`

function statusBadge(gift: Gift, vi: boolean) {
  const text = vi ? { open: 'Đang mở', empty: 'Đã hết', refunded: 'Đã thu hồi', expired: 'Hết hạn' } : { open: 'Open', empty: 'All claimed', refunded: 'Refunded', expired: 'Expired' }
  return <Badge tone={gift.status === 'open' ? 'live' : gift.status === 'empty' ? 'ok' : 'warn'}>{text[gift.status]}</Badge>
}

// ---------------------------------------------------------------- activation (one-time deploy)
function ActivateCard({ vi, onActivated }: { vi: boolean; onActivated: () => void }) {
  const w = useWallet()
  const write = useReviewedWrite()
  const [error, setError] = useState('')
  const start = async () => {
    setError('')
    const p = getProvider()
    if (!p || w.mode !== 'connected') { setError(L(vi, 'Connect your wallet first.', 'Hãy kết nối ví trước.')); return }
    try {
      const tx = await prepareTx(p, w.address as Address, CREATE2_PROXY, giftsDeployData())
      write.review({
        label: L(vi, `Activate gift links: deploy the MakotoGifts contract to its fixed address ${short(GIFTS_ADDRESS)} (USDC and EURC only; no owner, no admin, no fees).`, `Kích hoạt Lì xì: đưa hợp đồng MakotoGifts lên địa chỉ cố định ${short(GIFTS_ADDRESS)} (chỉ USDC và EURC; không chủ sở hữu, không admin, không thu phí).`),
        tx,
        onConfirmed: async () => { const ok = await giftsDeployed(); if (ok) onActivated(); return ok },
      })
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not prepare the activation.') }
  }
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 font-semibold"><Rocket size={16} className="text-neon-300" /> {L(vi, 'Gift links are not activated yet', 'Lì xì chưa được kích hoạt')}</div>
      <p className={`mt-1.5 text-[13px] ${T.sub}`}>{L(vi, 'This only needs to happen once for everyone. It costs a little test USDC for gas and always lands at the same fixed address.', 'Chỉ cần làm một lần cho tất cả mọi người. Tốn một ít USDC test làm phí, và hợp đồng luôn nằm ở đúng một địa chỉ cố định.')}</p>
      <Button className="mt-3" variant="primary" disabled={w.mode !== 'connected' || write.phase.kind === 'wallet' || write.phase.kind === 'pending'} onClick={() => void start()}><Rocket size={14} /> {L(vi, 'Activate gift links', 'Kích hoạt Lì xì')}</Button>
      {w.mode !== 'connected' && <p className={`mt-2 text-[12.5px] ${T.mute}`}>{L(vi, 'Connect a wallet to activate.', 'Kết nối ví để kích hoạt.')}</p>}
      {error && <p className="mt-2 text-[12.5px] text-rose-300">{error}</p>}
      <TxPanel vi={vi} phase={write.phase} onCancel={() => write.setPhase({ kind: 'idle' })} onConfirm={() => write.phase.kind === 'review' && void write.confirm(write.phase.step, L(vi, 'Gift links are live.', 'Lì xì đã được kích hoạt.'))} />
    </Card>
  )
}

// ---------------------------------------------------------------- share box
function ShareLink({ id, keyHex, vi }: { id: bigint; keyHex: Hex; vi: boolean }) {
  const w = useWallet()
  const link = giftLink(id, keyHex)
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'Makoto lì xì', text: L(vi, 'A gift for you on Makoto Wallet 🧧', 'Lì xì cho bạn trên Makoto Wallet 🧧'), url: link }); return } catch { /* cancelled */ } }
    await navigator.clipboard?.writeText(link); w.notify(L(vi, 'Link copied', 'Đã sao chép link'))
  }
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-lg bg-white p-1.5"><QRCodeSVG value={link} size={96} level="M" /></div>
        <div className="min-w-0 flex-1 space-y-2">
          <p data-gift-link className={`text-[11.5px] ${T.mute} break-all font-mono`}>{link}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => { void navigator.clipboard?.writeText(link).then(() => w.notify(L(vi, 'Link copied', 'Đã sao chép link'))) }}><Copy size={13} /> {L(vi, 'Copy link', 'Sao chép link')}</Button>
            <Button size="sm" onClick={() => void share()}><Share2 size={13} /> {L(vi, 'Share', 'Chia sẻ')}</Button>
          </div>
        </div>
      </div>
      <p className="flex gap-2 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-2.5 text-[12px] text-amber-100"><ShieldAlert size={14} className="mt-0.5 shrink-0" /> {L(vi, 'Anyone who has this link can open a share. Send it only to people or groups you trust — never post it publicly.', 'Ai có link này đều mở được một phần quà. Chỉ gửi cho người hoặc nhóm bạn tin tưởng — đừng đăng công khai.')}</p>
    </div>
  )
}

// ---------------------------------------------------------------- create
function CreateCard({ vi, onCreated }: { vi: boolean; onCreated: (id: bigint, key: Hex) => void }) {
  const w = useWallet()
  const write = useReviewedWrite()
  const [token, setToken] = useState<PayToken>('USDC')
  const [total, setTotal] = useState('')
  const [count, setCount] = useState('5')
  const [lucky, setLucky] = useState(true)
  const [expiry, setExpiry] = useState('7')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const pending = useRef<{ key: Hex; signer: Address; shares: bigint[]; signature: string } | null>(null)
  const start = async () => {
    setError('')
    const decimals = PAY_TOKENS[token].decimals
    const amount = parseUnitsText(total, decimals)
    if (amount === null) { setError(L(vi, 'Enter a valid total amount.', 'Nhập tổng số tiền hợp lệ.')); return }
    const n = Number(count)
    if (!Number.isInteger(n) || n < 1 || n > MAX_SHARES) { setError(L(vi, `Number of people must be 1–${MAX_SHARES}.`, `Số người nhận phải từ 1 đến ${MAX_SHARES}.`)); return }
    if (amount < BigInt(n)) { setError(L(vi, 'The total is too small for that many people.', 'Tổng tiền quá nhỏ cho số người này.')); return }
    const note = memo.trim()
    if (new TextEncoder().encode(note).length > 140) { setError(L(vi, 'Message is too long (max 140 bytes).', 'Lời chúc quá dài (tối đa 140 byte).')); return }
    const p = getProvider()
    if (!p || w.mode !== 'connected') { setError(L(vi, 'Connect your wallet first.', 'Hãy kết nối ví trước.')); return }
    const account = w.address as Address
    try {
      const [allowance, balance] = await Promise.all([readAllowanceUnits(token, account, GIFTS_ADDRESS), readTokenUnits(token, account)])
      if (balance < amount) { setError(L(vi, `Not enough ${token}.`, `Không đủ ${token}.`)); return }
      const totalText = amountOf(amount, token)
      if (allowance < amount) {
        const tx = await prepareTx(p, account, PAY_TOKENS[token].address, approveData(GIFTS_ADDRESS, amount))
        write.review({ label: L(vi, `Step 1/2 · Approve exactly ${totalText} for gift links (not unlimited). Some wallets show this as ${amount.toLocaleString('en-US')} "Unknown" — the same amount in raw token units.`, `Bước 1/2 · Cho phép đúng ${totalText} cho Lì xì (không phải không giới hạn). Một số ví hiển thị là ${amount.toLocaleString('en-US')} "Unknown" — chính là số tiền này tính theo đơn vị gốc.`), tx, onConfirmed: async () => (await readAllowanceUnits(token, account, GIFTS_ADDRESS)) >= amount })
        return
      }
      // Keep the same key and split while the user is reviewing this exact gift.
      const signature = `${token}|${amount}|${n}|${lucky}`
      if (!pending.current || pending.current.signature !== signature) {
        const { key, signer } = newLinkKey()
        const shares = lucky && n > 1 ? splitRandom(amount, n, amount / BigInt(n * 5) || 1n) : splitEqual(amount, n)
        pending.current = { key, signer, shares, signature }
      }
      const { key, signer, shares } = pending.current
      const days = Number(expiry)
      const expiresAt = Math.floor(Date.now() / 1000) + days * 86_400 - (days === 30 ? 900 : 0)
      const tx = await prepareTx(p, account, GIFTS_ADDRESS, createGiftData({ token, shares, claimSigner: signer, expiresAt, memo: note }))
      write.review({
        label: n === 1
          ? L(vi, `Create a gift link: ${totalText} for 1 person. Unclaimed money can be taken back by you at any time.`, `Tạo lì xì: ${totalText} cho 1 người. Phần chưa ai nhận bạn có thể thu hồi bất cứ lúc nào.`)
          : L(vi, `Create a gift link: ${totalText} for ${n} people (${lucky ? 'random amounts' : 'equal shares'}). Unclaimed money can be taken back by you at any time.`, `Tạo lì xì: ${totalText} cho ${n} người (${lucky ? 'chia ngẫu nhiên' : 'chia đều'}). Phần chưa ai nhận bạn có thể thu hồi bất cứ lúc nào.`),
        tx,
        onConfirmed: (receipt) => {
          const id = createdGiftId(receipt, account, signer)
          if (id === null) return false
          rememberMyGift(account, id, key)
          pending.current = null
          onCreated(id, key)
          return true
        },
      })
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not prepare the gift.') }
  }
  const busy = write.phase.kind === 'wallet' || write.phase.kind === 'pending'
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 font-semibold"><GiftIcon size={16} className="text-rose-300" /> {L(vi, 'New gift link', 'Tạo lì xì mới')}</div>
      <p className={`mt-1 text-[12.5px] ${T.sub}`}>{L(vi, 'Friends open the link and receive their share — they do not need any USDC for fees.', 'Bạn bè mở link là nhận quà — không cần có sẵn USDC để trả phí.')}</p>
      <div className="mt-3 grid sm:grid-cols-2 gap-3">
        <Field label={L(vi, 'Token', 'Token')}>
          <div className="flex gap-2">{(['USDC', 'EURC'] as PayToken[]).map((item) => <button key={item} type="button" aria-pressed={token === item} onClick={() => setToken(item)} className={`h-10 flex-1 rounded-xl border text-[13px] font-semibold ${token === item ? 'border-neon-400 bg-neon-500/10 text-neon-200' : 'border-white/[0.08]'}`}>{item}</button>)}</div>
        </Field>
        <Field label={L(vi, 'Total amount', 'Tổng số tiền')}><input aria-label={L(vi, 'Total amount', 'Tổng số tiền')} value={total} onChange={(e) => setTotal(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="10" className={`${inputCls} h-10`} /></Field>
        <Field label={L(vi, 'Number of people', 'Số người nhận')} hint={`1–${MAX_SHARES}`}><input aria-label={L(vi, 'Number of people', 'Số người nhận')} value={count} onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className={`${inputCls} h-10`} /></Field>
        <Field label={L(vi, 'How to split', 'Cách chia')}>
          <div className="flex gap-2">
            <button type="button" aria-pressed={lucky} onClick={() => setLucky(true)} className={`h-10 flex-1 rounded-xl border text-[13px] font-semibold ${lucky ? 'border-rose-400 bg-rose-500/10 text-rose-200' : 'border-white/[0.08]'}`}>🎲 {L(vi, 'Random', 'Ngẫu nhiên')}</button>
            <button type="button" aria-pressed={!lucky} onClick={() => setLucky(false)} className={`h-10 flex-1 rounded-xl border text-[13px] font-semibold ${!lucky ? 'border-neon-400 bg-neon-500/10 text-neon-200' : 'border-white/[0.08]'}`}>{L(vi, 'Equal', 'Chia đều')}</button>
          </div>
        </Field>
        <Field label={L(vi, 'Message', 'Lời chúc')}><input aria-label={L(vi, 'Message', 'Lời chúc')} value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={140} placeholder={L(vi, 'Happy new year!', 'Chúc mừng năm mới!')} className={`${inputCls} h-10`} /></Field>
        <Field label={L(vi, 'Expires', 'Hết hạn')}>
          <select aria-label={L(vi, 'Expires', 'Hết hạn')} value={expiry} onChange={(e) => setExpiry(e.target.value)} className={`${inputCls} h-10`}>
            <option value="1" className="bg-[#18181e]">{L(vi, 'In 1 day', 'Sau 1 ngày')}</option>
            <option value="7" className="bg-[#18181e]">{L(vi, 'In 7 days', 'Sau 7 ngày')}</option>
            <option value="30" className="bg-[#18181e]">{L(vi, 'In 30 days', 'Sau 30 ngày')}</option>
          </select>
        </Field>
      </div>
      <Button className="mt-4" variant="primary" disabled={busy || w.mode !== 'connected'} onClick={() => void start()}><GiftIcon size={14} /> {L(vi, 'Review gift', 'Xem lại lì xì')}</Button>
      {w.mode !== 'connected' && <p className={`mt-2 text-[12.5px] ${T.mute}`}>{L(vi, 'Connect a wallet to create gift links.', 'Kết nối ví để tạo lì xì.')}</p>}
      {error && <p className="mt-2 text-[12.5px] text-rose-300">{error}</p>}
      <TxPanel vi={vi} phase={write.phase} onCancel={() => write.setPhase({ kind: 'idle' })} onConfirm={() => write.phase.kind === 'review' && void write.confirm(write.phase.step, L(vi, 'Confirmed on Arc.', 'Đã xác nhận trên Arc.'))} />
    </Card>
  )
}

// ---------------------------------------------------------------- my gift (creator view)
function MyGiftCard({ id, keyHex, vi, showLink = false }: { id: bigint; keyHex: Hex; vi: boolean; showLink?: boolean }) {
  const w = useWallet()
  const write = useReviewedWrite()
  const [gift, setGift] = useState<Gift | null | undefined>(undefined)
  const [open, setOpen] = useState(showLink)
  const [error, setError] = useState('')
  const load = useCallback(async () => setGift(await readGift(id).catch(() => null)), [id])
  useEffect(() => { void load() }, [load])
  if (gift === undefined) return <Card className="p-4"><p className={`text-[13px] ${T.mute}`}><Loader2 size={14} className="inline animate-spin" /> {L(vi, 'Loading gift…', 'Đang tải lì xì…')}</p></Card>
  if (gift === null) return null
  const remaining = gift.total - gift.claimedAmount
  const canRefund = !gift.refunded && remaining > 0n && w.mode === 'connected' && w.address?.toLowerCase() === gift.creator.toLowerCase()
  const startRefund = async () => {
    setError('')
    const p = getProvider()
    if (!p || !w.address) return
    try {
      const tx = await prepareTx(p, w.address as Address, GIFTS_ADDRESS, refundData(id))
      write.review({ label: L(vi, `Take back the unclaimed ${amountOf(remaining, gift.token)} and close this gift link.`, `Thu hồi ${amountOf(remaining, gift.token)} chưa ai nhận và đóng link lì xì này.`), tx, onConfirmed: (receipt) => { const ok = refundedMatches(receipt, id); if (ok) void load(); return ok } })
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not prepare the refund.') }
  }
  return (
    <Card className="p-4">
      <div data-my-gift={id.toString()} className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-[12px] ${T.mute}`}>🧧 {L(vi, 'Gift', 'Lì xì')} #{id.toString()}</div>
          <div className="mt-0.5 text-[18px] font-bold tabular-nums">{amountOf(gift.total, gift.token)}</div>
          {gift.memo && <p className="mt-0.5 text-[13px] break-words">“{gift.memo}”</p>}
        </div>
        {statusBadge(gift, vi)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
        <span className="flex items-center gap-1"><Users size={13} /> {L(vi, 'Claimed', 'Đã nhận')} {gift.claimedCount}/{gift.shareCount}</span>
        <span className={T.sub}>{L(vi, 'Left', 'Còn lại')} {gift.refunded ? '0' : amountOf(remaining, gift.token)}</span>
        <span className={T.mute}>{L(vi, 'Expires', 'Hết hạn')} {new Date(gift.expiresAt * 1000).toLocaleString(vi ? 'vi-VN' : 'en-US')}</span>
      </div>
      {gift.claimers.length > 0 && (
        <ul className="mt-2 space-y-1 text-[12px]">
          {gift.claimers.map((who, i) => <li key={`${who}-${i}`} className="flex justify-between gap-2"><span className="font-mono">{short(who)}</span><span className="tabular-nums">{amountOf(gift.shares[i] ?? 0n, gift.token)}</span></li>)}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {gift.status === 'open' && <Button size="sm" onClick={() => setOpen((v) => !v)}><Share2 size={13} /> {open ? L(vi, 'Hide link', 'Ẩn link') : L(vi, 'Show link', 'Hiện link')}</Button>}
        {canRefund && <Button size="sm" disabled={write.phase.kind === 'wallet' || write.phase.kind === 'pending'} onClick={() => void startRefund()}>{L(vi, 'Take back the rest', 'Thu hồi phần còn lại')}</Button>}
      </div>
      {open && gift.status === 'open' && <ShareLink id={id} keyHex={keyHex} vi={vi} />}
      {error && <p className="mt-2 text-[12.5px] text-rose-300">{error}</p>}
      <TxPanel vi={vi} phase={write.phase} onCancel={() => write.setPhase({ kind: 'idle' })} onConfirm={() => write.phase.kind === 'review' && void write.confirm(write.phase.step, L(vi, 'Refunded to your wallet.', 'Đã hoàn về ví của bạn.'))} />
    </Card>
  )
}

// ---------------------------------------------------------------- claim (recipient view)
type ClaimState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'pending'; hash: Hex } | { kind: 'done'; hash: Hex; amount: bigint } | { kind: 'error'; message: string; hash?: Hex; selfPay: boolean }

function relayErrorText(code: string | undefined, vi: boolean): { text: string; selfPay: boolean } {
  switch (code) {
    case 'AlreadyClaimed': return { text: L(vi, 'This wallet has already opened this gift.', 'Ví này đã nhận lì xì này rồi.'), selfPay: false }
    case 'GiftEmpty': return { text: L(vi, 'Too late — every share has been claimed.', 'Chậm mất rồi — mọi phần quà đã được nhận hết.'), selfPay: false }
    case 'GiftExpired': return { text: L(vi, 'This gift link has expired.', 'Link lì xì này đã hết hạn.'), selfPay: false }
    case 'GiftRefunded': return { text: L(vi, 'The sender has closed this gift.', 'Người gửi đã đóng lì xì này.'), selfPay: false }
    case 'CreatorCannotClaim': return { text: L(vi, 'You created this gift, so you cannot claim it.', 'Bạn là người tạo lì xì nên không thể tự nhận.'), selfPay: false }
    case 'BadSignature': return { text: L(vi, 'This link is not valid. Ask the sender for the full link.', 'Link không hợp lệ. Hãy xin lại người gửi link đầy đủ.'), selfPay: false }
    case 'RELAYER_LOW': return { text: L(vi, 'The free fee helper is out of funds right now. You can still claim and pay the tiny fee yourself.', 'Trạm trả phí miễn phí đang hết tiền. Bạn vẫn có thể tự trả một khoản phí rất nhỏ để nhận.'), selfPay: true }
    case 'RATE_LIMITED': return { text: L(vi, 'Too many claims from this connection. Try again in a few minutes, or pay the fee yourself.', 'Quá nhiều lượt nhận từ mạng này. Thử lại sau vài phút, hoặc tự trả phí.'), selfPay: true }
    default: return { text: L(vi, 'The free fee helper is unavailable right now. You can claim and pay the tiny fee yourself.', 'Trạm trả phí miễn phí đang tạm lỗi. Bạn có thể tự trả một khoản phí rất nhỏ để nhận.'), selfPay: true }
  }
}

function ClaimCard({ id, keyHex, vi, relayer }: { id: bigint; keyHex: Hex; vi: boolean; relayer: RelayerStatus | null }) {
  const w = useWallet()
  const write = useReviewedWrite()
  const [gift, setGift] = useState<Gift | null | undefined>(undefined)
  const [state, setState] = useState<ClaimState>({ kind: 'idle' })
  const [connectOpen, setConnectOpen] = useState(false)
  const load = useCallback(async () => setGift(await readGift(id).catch(() => null)), [id])
  useEffect(() => { void load() }, [load])
  const me = w.mode === 'connected' && w.address ? w.address as Address : null
  const keyValid = useMemo(() => { try { return gift ? linkSigner(keyHex) === gift.claimSigner : false } catch { return false } }, [gift, keyHex])

  const envelope = (body: React.ReactNode) => (
    <div data-gift-claim={id.toString()} className="relative overflow-hidden rounded-3xl border border-amber-300/40 p-6 text-center shadow-[0_20px_60px_-20px_rgba(220,38,38,0.6)]" style={{ background: 'radial-gradient(120% 90% at 50% 0%, #e11d48 0%, #b91c1c 45%, #7f1d1d 100%)' }}>
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[140%] -translate-x-1/2 rounded-[50%] border-b-2 border-amber-300/50 bg-red-700/40" />
      <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-amber-200 bg-gradient-to-b from-amber-200 to-amber-500 text-red-800 shadow-lg"><GiftIcon size={28} /></div>
      <div className="relative mt-4 text-amber-50">{body}</div>
    </div>
  )

  if (gift === undefined) return envelope(<p className="text-[13px]"><Loader2 size={14} className="inline animate-spin" /> {L(vi, 'Opening the envelope…', 'Đang mở bao lì xì…')}</p>)
  if (gift === null || !keyValid) return envelope(<p className="text-[14px]">{L(vi, 'This gift link is not valid. Ask the sender for the full link.', 'Link lì xì không hợp lệ. Hãy xin lại người gửi link đầy đủ.')}</p>)

  const isCreator = me?.toLowerCase() === gift.creator.toLowerCase()
  const claimedIndex = me ? gift.claimers.findIndex((a) => a.toLowerCase() === me.toLowerCase()) : -1
  const header = (
    <>
      <div className="text-[12px] uppercase tracking-[0.14em] text-amber-200/90">{L(vi, 'A gift from', 'Lì xì từ')} {short(gift.creator)}</div>
      {gift.memo && <p className="mt-2 text-[20px] font-bold leading-snug break-words text-amber-50">“{gift.memo}”</p>}
      <p className="mt-2 text-[13px] text-amber-100/90">{amountOf(gift.total, gift.token)} · {gift.shareCount} {L(vi, gift.shareCount === 1 ? 'person' : 'people', 'người')} · {L(vi, 'claimed', 'đã nhận')} {gift.claimedCount}/{gift.shareCount}</p>
    </>
  )

  const claimFree = async () => {
    if (!me) return
    setState({ kind: 'sending' })
    try {
      const signature = await claimSignature(keyHex, id, me)
      const sent = await relayClaim(id, me, signature)
      if ('error' in sent) { const info = relayErrorText(sent.code, vi); setState({ kind: 'error', message: info.text, selfPay: info.selfPay }); if (!info.selfPay) void load(); return }
      setState({ kind: 'pending', hash: sent.hash })
      const outcome = await waitForReceipt(sent.hash)
      const amount = outcome.status === 'confirmed' ? claimedAmount(outcome.receipt, id, me) : null
      if (amount !== null) { setState({ kind: 'done', hash: sent.hash, amount }); void load(); return }
      setState({ kind: 'error', hash: sent.hash, message: outcome.status === 'unknown' ? L(vi, 'Still waiting for Arc — check the transaction before trying again.', 'Arc chưa xác nhận — hãy kiểm tra giao dịch trước khi thử lại.') : L(vi, 'The claim did not go through.', 'Nhận lì xì không thành công.'), selfPay: outcome.status === 'failed' })
    } catch { setState({ kind: 'error', message: L(vi, 'Could not open the gift. Try again.', 'Không mở được lì xì. Hãy thử lại.'), selfPay: true }) }
  }
  const claimSelf = async () => {
    if (!me) return
    const p = getProvider()
    if (!p) return
    try {
      const signature = await claimSignature(keyHex, id, me)
      const tx = await prepareTx(p, me, GIFTS_ADDRESS, claimData(id, me, signature))
      write.review({ label: L(vi, `Claim your share of gift #${id} into ${short(me)}. You pay the small network fee.`, `Nhận phần lì xì #${id} vào ví ${short(me)}. Bạn tự trả phí mạng nhỏ.`), tx, onConfirmed: (receipt) => { const amount = claimedAmount(receipt, id, me); if (amount !== null) { setState({ kind: 'done', hash: (receipt?.transactionHash as Hex) ?? '0x', amount }); void load() } return amount !== null } })
    } catch (caught) { setState({ kind: 'error', message: caught instanceof Error ? caught.message : 'Could not prepare the claim.', selfPay: false }) }
  }

  let body: React.ReactNode
  if (state.kind === 'done') {
    body = <>
      <div className="py-1"><SuccessBurst size={56} /></div>
      <p className="text-[13px] text-amber-100">{L(vi, 'You received', 'Bạn đã nhận được')}</p>
      <p data-gift-received className="text-[34px] font-extrabold tabular-nums text-amber-200">{amountOf(state.amount, gift.token)}</p>
      {/^0x[0-9a-fA-F]{64}$/.test(state.hash) && <a className="mt-1 inline-flex items-center gap-1 text-[12px] text-amber-100 underline" href={`${ARC.explorer}/tx/${state.hash}`} target="_blank" rel="noreferrer">{L(vi, 'View on ArcScan', 'Xem trên ArcScan')} <ExternalLink size={11} /></a>}
    </>
  } else if (claimedIndex >= 0) {
    body = <><p className="text-[13px] text-amber-100">{L(vi, 'You already opened this gift and received', 'Bạn đã mở lì xì này và nhận được')}</p><p className="text-[28px] font-extrabold tabular-nums text-amber-200">{amountOf(gift.shares[claimedIndex] ?? 0n, gift.token)}</p></>
  } else if (isCreator) {
    body = <p className="text-[13.5px] text-amber-100">{L(vi, 'This is your own gift. Share the link with friends — you can follow it in “My gifts” below.', 'Đây là lì xì của bạn. Gửi link cho bạn bè — theo dõi ở mục “Lì xì của tôi” bên dưới.')}</p>
  } else if (gift.status !== 'open') {
    body = <p className="text-[14px] font-semibold text-amber-100">{gift.status === 'empty' ? L(vi, 'Too late — every share has been claimed.', 'Chậm mất rồi — mọi phần quà đã được nhận hết.') : gift.status === 'expired' ? L(vi, 'This gift link has expired.', 'Link lì xì này đã hết hạn.') : L(vi, 'The sender has closed this gift.', 'Người gửi đã đóng lì xì này.')}</p>
  } else if (!me) {
    body = <>
      <p className="text-[13.5px] text-amber-100">{L(vi, 'Sign in with Google or connect a wallet to open your gift. No USDC needed.', 'Đăng nhập Google hoặc kết nối ví để mở lì xì. Không cần có sẵn USDC.')}</p>
      <button type="button" onClick={() => setConnectOpen(true)} className="mt-4 inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-b from-amber-200 to-amber-400 px-6 text-[15px] font-bold text-red-900 shadow-lg"><Wallet size={16} /> {L(vi, 'Sign in to open', 'Đăng nhập để mở')}</button>
    </>
  } else {
    const relayerReady = !!relayer?.enabled && relayer.contractDeployed !== false && !relayer.low
    const busy = state.kind === 'sending' || state.kind === 'pending' || write.phase.kind === 'wallet' || write.phase.kind === 'pending'
    body = <>
      <p className="text-[12.5px] text-amber-100/90">{L(vi, 'Your share goes to', 'Quà sẽ vào ví')} <span className="font-mono">{short(me)}</span></p>
      {relayerReady
        ? <button type="button" data-gift-open disabled={busy} onClick={() => void claimFree()} className="mt-4 inline-flex h-14 items-center gap-2 rounded-full bg-gradient-to-b from-amber-200 to-amber-400 px-8 text-[17px] font-extrabold text-red-900 shadow-lg disabled:opacity-60">{busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />} {L(vi, 'Open gift', 'Mở lì xì')}</button>
        : <button type="button" disabled={busy} onClick={() => void claimSelf()} className="mt-4 inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-b from-amber-200 to-amber-400 px-6 text-[15px] font-bold text-red-900 shadow-lg disabled:opacity-60"><Fuel size={16} /> {L(vi, 'Open gift (pay fee from wallet)', 'Mở lì xì (tự trả phí bằng ví)')}</button>}
      {relayerReady && <p className="mt-2 text-[11.5px] text-amber-100/80">{L(vi, 'Network fee is covered by Makoto. Your wallet will not ask you to sign anything.', 'Phí mạng do Makoto trả. Ví của bạn không cần ký gì cả.')}</p>}
      {state.kind === 'pending' && <p className="mt-3 text-[12.5px] text-amber-100"><Loader2 size={13} className="inline animate-spin" /> {L(vi, 'Waiting for Arc…', 'Đang chờ Arc xác nhận…')}</p>}
      {state.kind === 'error' && <div className="mt-3 space-y-2">
        <p className="flex items-start justify-center gap-1.5 text-[12.5px] text-amber-50"><XCircle size={14} className="mt-0.5 shrink-0" /> {state.message}</p>
        {state.selfPay && relayerReady && <Button size="sm" onClick={() => void claimSelf()}><Fuel size={13} /> {L(vi, 'Pay the fee from my wallet', 'Tự trả phí bằng ví')}</Button>}
      </div>}
    </>
  }
  return (
    <>
      {envelope(<>{header}<div className="mt-5">{body}</div></>)}
      <TxPanel vi={vi} phase={write.phase} onCancel={() => write.setPhase({ kind: 'idle' })} onConfirm={() => write.phase.kind === 'review' && void write.confirm(write.phase.step, L(vi, 'Gift received.', 'Đã nhận lì xì.'))} />
      <ConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} />
    </>
  )
}

// ---------------------------------------------------------------- page
export default function GiftsPage() {
  const w = useWallet()
  const [, lang] = useT()
  const vi = lang === 'vi'
  const [deployed, setDeployed] = useState<boolean | null>(null)
  const [relayer, setRelayer] = useState<RelayerStatus | null>(null)
  const [opened, setOpened] = useState(() => typeof window === 'undefined' ? null : giftFromHash(window.location.hash))
  const [created, setCreated] = useState<{ id: bigint; key: Hex } | null>(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => { let alive = true; void giftsDeployed().then((ok) => { if (alive) setDeployed(ok) }); void relayerStatus().then((s) => { if (alive) setRelayer(s) }); return () => { alive = false } }, [])
  useEffect(() => {
    const onHash = () => setOpened(giftFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const account = w.mode === 'connected' ? w.address : undefined
  const mine = useMemo(() => myGifts(account), [account, refresh])
  return (
    <>
      <PageHeader eyebrow={L(vi, 'Transactions', 'Giao dịch')} title={L(vi, 'Gift links', 'Lì xì')} />
      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <div className="space-y-4">
          {deployed === null && <Card className="p-5"><p className={`text-[13px] ${T.mute}`}><Loader2 size={14} className="inline animate-spin" /> {L(vi, 'Checking Arc…', 'Đang kiểm tra Arc…')}</p></Card>}
          {deployed && opened && <ClaimCard key={`${opened.id}-${opened.key}`} id={opened.id} keyHex={opened.key} vi={vi} relayer={relayer} />}
          {deployed === false && <ActivateCard vi={vi} onActivated={() => { setDeployed(true); void relayerStatus().then(setRelayer) }} />}
          {deployed && created && (
            <Card className="p-5 border-rose-400/30">
              <div className="flex items-center gap-2 font-semibold text-rose-100"><CheckCircle2 size={16} className="text-neon-300" /> {L(vi, `Gift #${created.id} is ready — share the link`, `Lì xì #${created.id} đã sẵn sàng — gửi link cho bạn bè`)}</div>
              <ShareLink id={created.id} keyHex={created.key} vi={vi} />
            </Card>
          )}
          {deployed && <CreateCard vi={vi} onCreated={(id, key) => { setCreated({ id, key }); setRefresh((n) => n + 1) }} />}
          {deployed && mine.length > 0 && (
            <div className="space-y-3">
              <div className={`text-[12px] font-semibold tracking-[0.08em] ${T.mute}`}>{L(vi, 'MY GIFTS (THIS DEVICE)', 'LÌ XÌ CỦA TÔI (TRÊN THIẾT BỊ NÀY)')}</div>
              {mine.slice(0, 20).map((g) => <MyGiftCard key={`${g.id}-${refresh}`} id={BigInt(g.id)} keyHex={g.key as Hex} vi={vi} />)}
            </div>
          )}
        </div>
        <aside className="space-y-4">
          <Card className="p-5">
            <div className="font-semibold">{L(vi, 'How it works', 'Cách hoạt động')}</div>
            <ol className={`mt-2 list-decimal pl-4 space-y-1.5 text-[12.5px] ${T.sub}`}>
              <li>{L(vi, 'You put USDC or EURC into a gift and choose how many people can open it.', 'Bạn bỏ USDC hoặc EURC vào bao lì xì và chọn bao nhiêu người được mở.')}</li>
              <li>{L(vi, 'You get a link. Send it to friends or a group chat you trust.', 'Bạn nhận được một link. Gửi cho bạn bè hoặc nhóm chat bạn tin tưởng.')}</li>
              <li>{L(vi, 'Each person opens it once and gets a share straight into their wallet — even with an empty wallet.', 'Mỗi người mở một lần và nhận quà thẳng vào ví — kể cả khi ví đang trống.')}</li>
              <li>{L(vi, 'Whatever is left unclaimed, you can take back any time.', 'Phần chưa ai nhận, bạn thu hồi lại bất cứ lúc nào.')}</li>
            </ol>
            <p className={`mt-3 text-[11.5px] ${T.mute}`}>{L(vi, 'The secret part of the link never leaves the browser. Until claimed, the money sits in a public contract that only you can refund — Makoto cannot touch it.', 'Phần bí mật trong link không bao giờ rời khỏi trình duyệt. Trước khi được nhận, tiền nằm trong hợp đồng công khai mà chỉ bạn thu hồi được — Makoto không thể đụng vào.')}</p>
          </Card>
          {relayer?.enabled && relayer.address && (
            <Card className="p-5">
              <div className="flex items-center gap-2 font-semibold"><Fuel size={15} className="text-neon-300" /> {L(vi, 'Free fee helper', 'Trạm trả phí miễn phí')}</div>
              <p className={`mt-1.5 text-[12.5px] ${T.sub}`}>{L(vi, 'Pays the network fee when friends open a gift.', 'Trả phí mạng giúp bạn bè khi mở lì xì.')}</p>
              <dl className="mt-2 grid grid-cols-[70px_minmax(0,1fr)] gap-y-1 text-[12px]">
                <dt className={T.mute}>{L(vi, 'Balance', 'Số dư')}</dt><dd className={relayer.low ? 'text-amber-300' : ''}>{Number(relayer.balance ?? 0).toFixed(4)} USDC</dd>
                <dt className={T.mute}>{L(vi, 'Address', 'Địa chỉ')}</dt><dd className="font-mono break-all">{relayer.address}</dd>
              </dl>
              {relayer.low && <p className="mt-2 text-[12px] text-amber-200">{L(vi, 'Running low — send a little test USDC to the address above to keep claims free.', 'Sắp hết — gửi một ít USDC test vào địa chỉ trên để bạn bè tiếp tục nhận miễn phí.')}</p>}
            </Card>
          )}
          {deployed && <a className={`inline-flex items-center gap-1 px-1 text-[12.5px] ${T.sub} hover:text-white`} href={`${ARC.explorer}/address/${GIFTS_ADDRESS}`} target="_blank" rel="noreferrer">{L(vi, 'Gift contract on ArcScan', 'Hợp đồng lì xì trên ArcScan')} <ExternalLink size={12} /></a>}
        </aside>
      </div>
    </>
  )
}
