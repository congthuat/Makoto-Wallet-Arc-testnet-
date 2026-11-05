import { useEffect, useState } from 'react'
import { CircleDollarSign, Loader2, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useT } from '../lib/i18n'
import { useWallet } from '../lib/store'
import { Button, Card, T } from './wallet/ui'
import { ConnectModal } from './wallet/shared'
import { getProvider } from '../lib/wallet'
import { prepareTx, sendPrepared, type PreparedTx } from '../lib/payRequests'
import { USDC_ADDRESS, usdcTransferData, usdcUnits, verifyTopUp, type CreditPack, type CreditState } from '../lib/credits'
import type { Address } from 'viem'

type PayPhase =
  | { kind: 'idle' }
  | { kind: 'review'; pack: CreditPack; tx: PreparedTx }
  | { kind: 'wallet' }
  | { kind: 'pending'; pack: CreditPack }
  | { kind: 'done'; credits: number }
  | { kind: 'error'; message: string }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The paid side of the Agent: free messages, credits, and a top-up that sends USDC from the
 * user's own wallet to the fee address. The server reads the transaction from Arc before
 * anything is credited, so this component never has to be trusted with the amount.
 */
export function AgentCreditsPanel({ state, onState, open, onClose }: { state: CreditState | undefined; onState: (next: CreditState) => void; open: boolean; onClose: () => void }) {
  const [tr] = useT()
  const w = useWallet()
  const [phase, setPhase] = useState<PayPhase>({ kind: 'idle' })
  const [connectOpen, setConnectOpen] = useState(false)
  const [verifyPending, setVerifyPending] = useState(false)

  useEffect(() => { if (!open) { setPhase({ kind: 'idle' }); setVerifyPending(false) } }, [open])

  const enabled = state?.enabled === true
  const packs = state?.packs ?? []
  const feeAddress = state?.feeAddress
  const freeLeft = state?.freeLeft ?? 0
  const balance = state?.balance ?? 0
  const cost = state?.costPerMessage ?? 3

  const verifyWallet = async () => {
    if (verifyPending) return
    setVerifyPending(true)
    try { await w.verifyTaskWallet() } catch { /* the shared gate shows the reason */ } finally { setVerifyPending(false) }
  }

  const start = async (pack: CreditPack) => {
    const units = usdcUnits(pack.usdc)
    if (!units || !feeAddress) return
    const provider = getProvider()
    if (!provider || w.mode !== 'connected' || !w.address) { setConnectOpen(true); return }
    try {
      const tx = await prepareTx(provider, w.address as Address, USDC_ADDRESS, usdcTransferData(feeAddress as Address, units))
      setPhase({ kind: 'review', pack, tx })
    } catch (caught) {
      setPhase({ kind: 'error', message: caught instanceof Error ? caught.message : tr('Could not prepare the payment.') })
    }
  }

  const confirm = async (pack: CreditPack, tx: PreparedTx) => {
    const provider = getProvider()
    if (!provider) { setPhase({ kind: 'error', message: tr('Wallet provider unavailable.') }); return }
    setPhase({ kind: 'wallet' })
    let hash: string
    try { hash = await sendPrepared(provider, tx) }
    catch (caught) { setPhase({ kind: 'error', message: caught instanceof Error ? caught.message : tr('The payment was not sent.') }); return }
    setPhase({ kind: 'pending', pack })
    // The server reads the receipt from Arc; the transaction needs a few seconds to land.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await sleep(attempt === 0 ? 2_500 : 3_000)
      const result = await verifyTopUp(hash)
      if (result.ok) {
        setPhase({ kind: 'done', credits: result.credits })
        onState({ ...(state ?? { enabled: true, freeLeft: 0, balance: 0, costPerMessage: cost, packs: [] }), balance: result.balance, freeLeft: result.freeLeft })
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12)
        return
      }
      if (result.code === 'PENDING' || result.code === 'RPC_UNAVAILABLE' || result.code === 'CREDITS_UNAVAILABLE') continue
      if (result.code === 'ALREADY_CREDITED') { setPhase({ kind: 'idle' }); return }
      setPhase({ kind: 'error', message: result.error })
      return
    }
    setPhase({ kind: 'error', message: tr('The payment is taking longer than usual. Open Activity and try again in a minute — nothing is lost.') })
  }

  if (!open) return null

  const busy = phase.kind === 'wallet' || phase.kind === 'pending'

  return (
    <div className="fixed inset-0 z-[86] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={tr('Agent credits')}>
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label={tr('Close')} />
      <div className="relative w-full sm:max-w-[460px] max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#17171d] shadow-2xl mk-in pb-[env(safe-area-inset-bottom)]">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/[0.06] bg-[#17171d] px-4 h-12">
          <Sparkles size={16} className="text-neon-300" />
          <span className="flex-1 text-[14px] font-semibold">{tr('Agent credits')}</span>
          <button onClick={onClose} aria-label={tr('Close')} className={`h-8 w-8 inline-flex items-center justify-center rounded-lg ${T.sub} hover:text-white hover:bg-white/[0.06]`}><X size={15} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <div className={`text-[11px] ${T.mute}`}>{tr('Free today')}</div>
              <div className="mt-0.5 text-[20px] font-bold tabular-nums">{freeLeft}</div>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <div className={`text-[11px] ${T.mute}`}>{tr('Credits')}</div>
              <div className="mt-0.5 text-[20px] font-bold tabular-nums">{balance}</div>
            </div>
          </div>
          <p className={`text-[12.5px] ${T.sub}`}>
            {tr('Each Agent answer that uses the AI costs {n} credits. Free messages reset every day; credits never expire.')
              .replace('{n}', String(cost))}
          </p>

          {!enabled && <p className={`text-[12.5px] ${T.mute}`}>{tr('Agent credits are turned off right now, so the Agent is free.')}</p>}

          {enabled && (
            <>
              {w.mode !== 'connected' && (
                <Button variant="primary" className="w-full" onClick={() => setConnectOpen(true)}>{tr('Connect your wallet')}</Button>
              )}
              {w.mode === 'connected' && !w.taskAuthenticated && (
                <Card className="p-3 border-amber-400/25">
                  <p className="flex items-center gap-2 text-[13px] font-semibold"><ShieldCheck size={15} className="text-neon-300" /> {tr('Verify your wallet to pay')}</p>
                  <p className={`mt-1 text-[12px] ${T.sub}`}>{tr('A one-time signature proves the wallet is yours. Makoto never asks for a password or seed phrase.')}</p>
                  <Button size="sm" variant="primary" className="mt-2" disabled={verifyPending || !w.taskWalletReady} onClick={() => void verifyWallet()}>{verifyPending ? '…' : tr('Verify wallet')}</Button>
                  {w.taskAuthError && <p className="mt-1.5 text-[12px] text-amber-300">{tr('Wallet verification is unavailable right now.')}</p>}
                </Card>
              )}

              <div className="space-y-2">
                <div className={`text-[12px] font-semibold tracking-[0.06em] uppercase ${T.mute}`}>{tr('Choose a top-up')}</div>
                {packs.map((pack) => (
                  <button
                    key={pack.usdc}
                    type="button"
                    disabled={busy || w.mode !== 'connected' || !w.taskAuthenticated || phase.kind === 'done'}
                    onClick={() => void start(pack)}
                    className={`w-full flex items-center justify-between rounded-xl border p-3 text-left transition disabled:opacity-50 ${phase.kind === 'review' && phase.pack.usdc === pack.usdc ? 'border-neon-400 bg-neon-500/10' : 'border-white/[0.08] hover:border-white/20'}`}
                    data-credit-pack={pack.usdc}
                  >
                    <span className="flex items-center gap-2 text-[13.5px] font-semibold"><CircleDollarSign size={15} className="text-neon-300" /> {pack.usdc} USDC</span>
                    <span className="text-[12.5px] tabular-nums">{pack.credits.toLocaleString('en-US')} {tr('credits')}</span>
                  </button>
                ))}
              </div>

              {phase.kind === 'review' && (
                <div className="rounded-xl border border-neon-500/30 bg-neon-500/[0.05] p-3 text-[13px] space-y-2">
                  <div className="font-semibold">{tr('Review before signing')}</div>
                  <p>{tr('Send {usdc} USDC on Arc to Makoto. Your wallet pays about {fee} USDC in network fees.')
                    .replace('{usdc}', phase.pack.usdc).replace('{fee}', phase.tx.feeUsdc.toFixed(6))}</p>
                  {feeAddress && <p className={`text-[11.5px] font-mono ${T.mute}`} title={feeAddress}>{tr('To')} {feeAddress.slice(0, 6)}…{feeAddress.slice(-4)}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" onClick={() => void confirm(phase.pack, phase.tx)}>{tr('Confirm in wallet')}</Button>
                    <Button size="sm" onClick={() => setPhase({ kind: 'idle' })}>{tr('Cancel')}</Button>
                  </div>
                </div>
              )}
              {(phase.kind === 'wallet' || phase.kind === 'pending') && (
                <p className="flex items-center gap-2 text-[13px]"><Loader2 size={15} className="animate-spin" /> {phase.kind === 'wallet' ? tr('Waiting for your wallet…') : tr('Waiting for the payment to confirm on Arc…')}</p>
              )}
              {phase.kind === 'done' && (
                <div className="rounded-xl border border-neon-500/30 bg-neon-500/[0.06] p-3 text-[13px] text-neon-200">
                  {tr('Credits added: {n}').replace('{n}', phase.credits.toLocaleString('en-US'))}
                </div>
              )}
              {phase.kind === 'error' && <p role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/[0.05] p-3 text-[12.5px] text-rose-200">{phase.message}</p>}

            </>
          )}
        </div>
      </div>
      <ConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  )
}

/**
 * Always-visible badge in the Agent panel header: free messages left today and the
 * credit balance. Tapping it opens the top-up panel.
 */
export function AgentCreditsPill({ state, onOpen }: { state: CreditState | undefined; onOpen: () => void }) {
  const [tr] = useT()
  if (!state?.enabled) return null
  const free = state.freeLeft
  const credits = state.balance
  const empty = free <= 0 && credits < state.costPerMessage
  const label = free > 0
    ? tr('{n} free today').replace('{n}', String(free))
    : tr('{n} credits').replace('{n}', credits.toLocaleString('en-US'))
  return (
    <button
      type="button"
      onClick={onOpen}
      data-agent-credits
      title={tr('Add credits')}
      aria-label={`${tr('Agent credits')}: ${label}`}
      className={`inline-flex items-center gap-1.5 h-8 shrink-0 rounded-full border px-2.5 text-[12px] font-medium transition ${empty ? 'border-amber-300/40 bg-amber-300/[0.08] text-amber-200 hover:bg-amber-300/[0.14]' : 'border-white/[0.12] bg-white/[0.04] hover:border-neon-400/50 hover:bg-white/[0.08]'}`}
    >
      <Sparkles size={12} className={empty ? 'text-amber-300' : 'text-neon-300'} />
      <span className="tabular-nums whitespace-nowrap">{label}</span>
      <span className="hidden sm:inline opacity-25">·</span>
      <span className="hidden sm:inline tabular-nums whitespace-nowrap">{credits.toLocaleString('en-US')} {tr('credits')}</span>
    </button>
  )
}

/** Small line above the chat box: only once the free allowance is used up. */
export function AgentCreditsBar({ state, onOpen }: { state: CreditState | undefined; onOpen: () => void }) {
  const [tr] = useT()
  if (!state?.enabled || state.freeLeft > 0) return null
  const free = state.freeLeft
  const credits = state.balance
  const empty = free <= 0 && credits < state.costPerMessage
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pb-2 text-[12px]" data-agent-credits>
      <span className={empty ? 'text-amber-300' : T.mute}>
        {free > 0
          ? tr('{n} free messages left today').replace('{n}', String(free))
          : tr('{n} credits · {c} per message').replace('{n}', String(credits)).replace('{c}', String(state.costPerMessage))}
      </span>
      <Button size="sm" variant={empty ? 'primary' : 'ghost'} onClick={onOpen} className="!h-7 !px-2.5 !text-[12px]">
        <Sparkles size={12} /> {empty ? tr('Add credits to keep going') : tr('Add credits')}
      </Button>
    </div>
  )
}
