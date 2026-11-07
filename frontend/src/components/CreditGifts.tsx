import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Gift, Link2, Loader2, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useT } from '../lib/i18n'
import { useWallet } from '../lib/store'
import { Button, Card, T } from './wallet/ui'
import { ConnectModal } from './wallet/shared'
import { SuccessBurst } from './wallet/SuccessBurst'
import {
  GIFT_PRESETS, MIN_GIFT_CREDITS, claimCreditGift, createCreditGift, creditGiftIdFromHash,
  creditGiftLink, readCreditGift, readSentCreditGifts,
  type CreditGiftInfo, type CreditState, type SentCreditGift,
} from '../lib/credits'

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch { return false }
}

const shortAddress = (address: string) => address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address

/** Every refusal the gift routes can return, in words a friend can act on. */
const GIFT_ERRORS: Record<string, string> = {
  INSUFFICIENT: 'You do not have enough credits to send this gift.',
  INVALID: 'That gift amount is not valid.',
  AUTH_REQUIRED: 'Verify your wallet first.',
  GIFT_RATE_LIMITED: 'Too many gift links just now. Try again in a few minutes.',
  CREDITS_UNAVAILABLE: 'Credits are unavailable right now. Try again in a minute.',
  NOT_FOUND: 'That gift link does not exist.',
  ALREADY_CLAIMED: 'Someone already claimed this gift.',
  EXPIRED: 'This gift link expired and the credits went back to the sender.',
  SELF_CLAIM: 'You cannot claim a gift you sent yourself.',
}

const giftError = (code: string, translate: (text: string) => string) =>
  translate(GIFT_ERRORS[code] ?? GIFT_ERRORS.CREDITS_UNAVAILABLE)

const stamp = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  try { return new Date(ms).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' }) } catch { return '' }
}

/**
 * Send part of your credit balance to a friend.
 * The credits leave the sender's balance when the link is created, and land in exactly
 * one wallet when a friend claims it. Unclaimed links return automatically after 30 days.
 */
export function CreditGiftSheet({ open, onClose, state, onState }: { open: boolean; onClose: () => void; state: CreditState | undefined; onState: (next: CreditState) => void }) {
  const [tr] = useT()
  const w = useWallet()
  const balance = state?.balance ?? 0
  const [amount, setAmount] = useState<number>(GIFT_PRESETS[0])
  const [custom, setCustom] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ id: string; credits: number } | null>(null)
  const [copied, setCopied] = useState(false)
  const [sent, setSent] = useState<SentCreditGift[]>([])
  const [connectOpen, setConnectOpen] = useState(false)
  const [verifyPending, setVerifyPending] = useState(false)
  const copiedTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!open) {
      setBusy(false); setError(''); setCreated(null); setCopied(false); setNote(''); setCustom('')
      setAmount(GIFT_PRESETS[0]); setConnectOpen(false); setVerifyPending(false)
    }
  }, [open])

  const canList = open && w.mode === 'connected' && w.taskAuthenticated
  useEffect(() => {
    if (!canList) { setSent([]); return }
    let alive = true
    void readSentCreditGifts().then((gifts) => { if (alive) setSent(gifts) })
    return () => { alive = false }
  }, [canList, open])

  useEffect(() => () => { if (copiedTimer.current) window.clearTimeout(copiedTimer.current) }, [])

  if (!open) return null

  const chosen = custom.trim() ? Number(custom.trim()) : amount
  const validAmount = Number.isSafeInteger(chosen) && chosen >= MIN_GIFT_CREDITS && chosen <= balance
  const ready = w.mode === 'connected' && w.taskAuthenticated

  const verifyWallet = async () => {
    if (verifyPending) return
    setVerifyPending(true)
    try { await w.verifyTaskWallet() } catch { /* the gate explains the failure */ } finally { setVerifyPending(false) }
  }

  const create = async () => {
    if (busy || !validAmount) return
    setBusy(true); setError('')
    const result = await createCreditGift({ credits: chosen, note })
    setBusy(false)
    if (!result.ok) { setError(giftError(result.code, tr)); return }
    setCreated({ id: result.id, credits: result.credits })
    onState(result.state)
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([12, 40, 12])
    void readSentCreditGifts().then(setSent)
  }

  const link = created ? creditGiftLink(created.id) : ''

  const copyLink = async (value: string) => {
    const done = await copyToClipboard(value)
    if (!done) return
    setCopied(true)
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => { setCopied(false); copiedTimer.current = null }, 1_800)
  }

  const share = async () => {
    if (!created) return
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: tr('Makoto credits'), text: tr('I sent you {n} Agent credits on Makoto.').replace('{n}', String(created.credits)), url: link }) } catch { /* dismissed */ }
      return
    }
    void copyLink(link)
  }

  const openGifts = sent.filter((gift) => !gift.claimed && !gift.expired)

  return (
    <div className="fixed inset-0 z-[87] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={tr('Gift credits')}>
      <button className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-label={tr('Close')} />
      <div className="relative w-full sm:max-w-[440px] max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#17171d] shadow-2xl mk-in pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/[0.06] bg-[#17171d] px-4 h-12">
          <Gift size={16} className="text-neon-300" />
          <span className="flex-1 text-[14px] font-semibold">{tr('Gift credits')}</span>
          <button onClick={onClose} aria-label={tr('Close')} className={`h-8 w-8 inline-flex items-center justify-center rounded-lg ${T.sub} hover:text-white hover:bg-white/[0.06]`}><X size={15} /></button>
        </div>

        <div className="p-4 space-y-4">
          {created ? (
            <div className="space-y-3" data-credit-gift-done>
              <div className="text-center">
                <SuccessBurst size={50} label={tr('Gift link ready')} />
                <p className="mt-3 text-[16px] font-bold text-neon-200 mk-pop">{tr('{n} credits ready to send').replace('{n}', created.credits.toLocaleString('en-US'))}</p>
                <p className={`mt-1 text-[12px] ${T.sub}`}>{tr('Send this link to one friend. The credits are yours again if nobody claims it before {d}.').replace('{d}', tr('30 days'))}</p>
              </div>
              <div className="rounded-xl border border-white/[0.09] bg-black/25 p-2.5">
                <p className="break-all text-[11.5px] font-mono text-white/80" data-credit-gift-link>{link}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="primary" className="flex-1" onClick={() => void share()}><Link2 size={14} /> {tr('Share link')}</Button>
                <Button className="flex-1" onClick={() => void copyLink(link)}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? tr('Copied') : tr('Copy link')}</Button>
              </div>
              <button type="button" onClick={() => { setCreated(null); setCopied(false) }} className={`w-full text-[12px] underline underline-offset-2 ${T.mute} hover:text-white`}>{tr('Send another gift')}</button>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
                <span className={`text-[11px] ${T.mute}`}>{tr('Your credits')}</span>
                <span className="ml-2 text-[15px] font-bold tabular-nums">{balance.toLocaleString('en-US')}</span>
              </div>

              {w.mode !== 'connected' && <Button variant="primary" className="w-full" onClick={() => setConnectOpen(true)}>{tr('Connect your wallet')}</Button>}
              {w.mode === 'connected' && !w.taskAuthenticated && (
                <Card className="p-3 border-amber-400/25">
                  <p className="flex items-center gap-2 text-[13px] font-semibold"><ShieldCheck size={15} className="text-neon-300" /> {tr('Verify your wallet to gift')}</p>
                  <p className={`mt-1 text-[12px] ${T.sub}`}>{tr('A one-time signature proves the wallet is yours. Makoto never asks for a password or seed phrase.')}</p>
                  <Button size="sm" variant="primary" className="mt-2" disabled={verifyPending || !w.taskWalletReady} onClick={() => void verifyWallet()}>{verifyPending ? '…' : tr('Verify wallet')}</Button>
                </Card>
              )}

              {ready && (
                <>
                  {balance < MIN_GIFT_CREDITS ? (
                    <p className={`text-[12.5px] ${T.sub}`}>{tr('You need at least {n} credits to send a gift. Top up first.').replace('{n}', String(MIN_GIFT_CREDITS))}</p>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <div className={`mb-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] ${T.mute}`}>{tr('How many credits?')}</div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {GIFT_PRESETS.map((preset) => (
                            <button key={preset} type="button" onClick={() => { setAmount(preset); setCustom('') }}
                              className={`h-9 rounded-lg border text-[12.5px] font-semibold tabular-nums transition ${!custom.trim() && amount === preset ? 'border-neon-400 bg-neon-500/10 text-white' : 'border-white/[0.09] text-white/80 hover:border-white/25'}`}>
                              {preset}
                            </button>
                          ))}
                        </div>
                        <input
                          value={custom}
                          onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                          inputMode="numeric"
                          placeholder={tr('Or type an amount')}
                          aria-label={tr('Custom credit amount')}
                          className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-black/25 px-2.5 py-2 text-[13px] tabular-nums outline-none focus:border-neon-400/60"
                        />
                        {!validAmount && (custom.trim() !== '' || amount > balance) && (
                          <p className="mt-1 text-[11.5px] text-amber-200">{tr('Choose between {min} and your balance ({max}).').replace('{min}', String(MIN_GIFT_CREDITS)).replace('{max}', String(balance))}</p>
                        )}
                      </div>
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value.slice(0, 120))}
                        maxLength={120}
                        placeholder={tr('A short note (optional)')}
                        aria-label={tr('Gift note')}
                        className="w-full rounded-lg border border-white/[0.1] bg-black/25 px-2.5 py-2 text-[13px] outline-none focus:border-neon-400/60"
                      />
                      <Button variant="primary" className="w-full" disabled={busy || !validAmount} onClick={() => void create()}>
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {tr('Create gift link')}
                      </Button>
                      <p className={`text-[11.5px] ${T.mute}`}>{tr('The credits leave your balance right away and return if the link expires unclaimed.')}</p>
                    </div>
                  )}
                  {error && <p role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/[0.05] p-2.5 text-[12px] text-rose-200">{error}</p>}

                  {openGifts.length > 0 && (
                    <div className="border-t border-white/[0.06] pt-3">
                      <div className={`mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] ${T.mute}`}>{tr('Links waiting to be claimed')}</div>
                      <div className="space-y-1.5">
                        {openGifts.map((gift) => (
                          <div key={gift.id} className="flex items-center gap-2 rounded-lg border border-white/[0.07] px-2.5 py-2">
                            <Gift size={13} className="text-neon-300 shrink-0" />
                            <span className="flex-1 min-w-0">
                              <span className="block text-[12.5px] font-medium tabular-nums">{gift.credits.toLocaleString('en-US')} {tr('credits')}</span>
                              <span className={`block truncate text-[11px] ${T.mute}`}>{gift.note || shortAddress(gift.id)} · {stamp(gift.expiresAt)}</span>
                            </span>
                            <button type="button" onClick={() => void copyLink(creditGiftLink(gift.id))} aria-label={tr('Copy link')} className={`h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md ${T.sub} hover:text-white hover:bg-white/[0.07]`}><Copy size={13} /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
      <ConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  )
}

/**
 * Opens automatically when someone follows a `#credit-<id>` link.
 * Claiming needs a signed-in wallet, because credits live with the wallet that earns them.
 */
export function CreditGiftClaim({ onState }: { onState: (next: CreditState) => void }) {
  const [tr] = useT()
  const w = useWallet()
  const [id, setId] = useState<string | null>(() => typeof window === 'undefined' ? null : creditGiftIdFromHash(window.location.hash))
  const [info, setInfo] = useState<CreditGiftInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<number | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [verifyPending, setVerifyPending] = useState(false)
  const closeTimer = useRef<number | null>(null)

  useEffect(() => {
    const onHash = () => setId(creditGiftIdFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (!id) { setInfo(null); setError(''); setDone(null); return }
    let alive = true
    setLoading(true)
    setError('')
    void readCreditGift(id).then((gift) => {
      if (!alive) return
      setLoading(false)
      setInfo(gift)
      if (!gift) setError(tr('That gift link is not valid.'))
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current) }, [])

  if (!id) return null

  const close = () => {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null }
    try { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`) } catch { /* ignore */ }
    setId(null)
    setInfo(null)
    setDone(null)
    setError('')
  }

  const verifyWallet = async () => {
    if (verifyPending) return
    setVerifyPending(true)
    try { await w.verifyTaskWallet() } catch { /* gate explains */ } finally { setVerifyPending(false) }
  }

  const claim = async () => {
    if (busy || !id) return
    setBusy(true); setError('')
    const result = await claimCreditGift(id)
    setBusy(false)
    if (!result.ok) { setError(giftError(result.code, tr)); return }
    setDone(result.credits)
    onState(result.state)
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([14, 60, 14])
    closeTimer.current = window.setTimeout(close, 3_200)
  }

  const unavailable = info && (info.claimed || info.expired)

  return (
    <div className="fixed inset-0 z-[88] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={tr('Credit gift')}>
      <button className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={close} aria-label={tr('Close')} />
      <div className="relative w-full sm:max-w-[400px] rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#17171d] shadow-2xl mk-in p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <button onClick={close} aria-label={tr('Close')} className={`absolute right-3 top-3 h-8 w-8 inline-flex items-center justify-center rounded-lg ${T.sub} hover:text-white hover:bg-white/[0.06]`}><X size={15} /></button>

        {done !== null ? (
          <div className="text-center py-2" data-credit-gift-claimed>
            <SuccessBurst size={58} label={tr('Credits received')} />
            <p className="mt-4 text-[20px] font-bold text-neon-200 tabular-nums mk-pop">+{done.toLocaleString('en-US')} {tr('credits')}</p>
            <p className="mt-1 text-[12.5px] text-neon-100/75">{tr('They are in your balance now.')}</p>
          </div>
        ) : loading ? (
          <div className="py-10 text-center"><Loader2 size={20} className="animate-spin mx-auto text-neon-300" /></div>
        ) : !info ? (
          <div className="py-6 text-center">
            <Gift size={26} className="mx-auto text-white/40" />
            <p className="mt-3 text-[14px] font-semibold">{tr('Gift link not found')}</p>
            <p className={`mt-1 text-[12.5px] ${T.sub}`}>{tr('The link may be mistyped or already used up.')}</p>
          </div>
        ) : (
          <>
            <p className={`text-[11.5px] font-semibold uppercase tracking-[0.1em] ${T.mute}`}>{tr('A gift for you')}</p>
            <p className="mt-2 text-[24px] font-bold tabular-nums text-neon-200">{info.credits.toLocaleString('en-US')} <span className="text-[14px] font-medium text-white/70">{tr('Agent credits')}</span></p>
            <p className={`mt-1 text-[12.5px] ${T.sub}`}>{tr('From {a}').replace('{a}', shortAddress(info.from))}{info.expiresAt ? ` · ${tr('expires')} ${stamp(info.expiresAt)}` : ''}</p>
            {info.note && <p className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] italic">“{info.note}”</p>}

            {unavailable ? (
              <p role="alert" className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] p-3 text-[12.5px] text-amber-200">
                {info.claimed ? tr('Someone already claimed this gift.') : tr('This gift expired and went back to the sender.')}
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {w.mode !== 'connected' ? (
                  <Button variant="primary" className="w-full" onClick={() => setConnectOpen(true)}>{tr('Connect your wallet to receive')}</Button>
                ) : !w.taskAuthenticated ? (
                  <>
                    <p className={`text-[12px] ${T.sub}`}>{tr('Verify your wallet with one signature. No gas, no transaction.')}</p>
                    <Button variant="primary" className="w-full" disabled={verifyPending || !w.taskWalletReady} onClick={() => void verifyWallet()}>{verifyPending ? '…' : tr('Verify wallet')}</Button>
                  </>
                ) : (
                  <Button variant="primary" className="w-full" disabled={busy} onClick={() => void claim()}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />} {tr('Claim {n} credits').replace('{n}', info.credits.toLocaleString('en-US'))}
                  </Button>
                )}
                {error && <p role="alert" className="text-[12px] text-rose-200">{error}</p>}
              </div>
            )}
          </>
        )}
      </div>
      <ConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  )
}
