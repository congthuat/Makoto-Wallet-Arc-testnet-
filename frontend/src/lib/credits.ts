import { encodeFunctionData, type Address, type Hex } from 'viem'
import { api } from './api.ts'

/** Agent credits, paid with USDC on Arc. Mirrors the server in backend/lib/agentFees.js. */
export type CreditPack = Readonly<{ usdc: string; credits: number }>
export type CreditState = Readonly<{
  enabled: boolean
  feeAddress?: string
  freeLeft: number
  balance: number
  costPerMessage: number
  packs?: readonly CreditPack[]
}>
export type TopUpResult = Readonly<{ ok: true; credits: number; paidUsdc: number; balance: number; freeLeft: number } | { ok: false; code: string; error: string; minimum?: number }>

export const EMPTY_CREDITS: CreditState = { enabled: false, freeLeft: 0, balance: 0, costPerMessage: 3, packs: [] }

const ERC20_TRANSFER_ABI = [{
  type: 'function', name: 'transfer', stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const

/** USDC on Arc uses 6 decimals for the ERC-20 side. */
export const USDC_UNITS = 1_000_000n

/**
 * The ERC-20 USDC contract on Arc. A top-up is a `transfer` call on this contract —
 * the transaction's `to` is the token, never the fee address (that never moves anything).
 */
export const USDC_ADDRESS: Address = '0x3600000000000000000000000000000000000000'

export function usdcUnits(amount: string): bigint | null {
  const text = amount.trim()
  if (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,6})?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  const units = BigInt(whole) * USDC_UNITS + BigInt((fraction + '000000').slice(0, 6))
  return units > 0n ? units : null
}

export const usdcTransferData = (to: Address, units: bigint): Hex =>
  encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: [to, units] })

export function parseCreditState(value: unknown): CreditState {
  if (!value || typeof value !== 'object') return EMPTY_CREDITS
  const v = value as Record<string, unknown>
  const packs = Array.isArray(v.packs)
    ? v.packs.flatMap((item) => item && typeof item === 'object' && typeof (item as CreditPack).usdc === 'string' && Number.isFinite((item as CreditPack).credits)
      ? [{ usdc: (item as CreditPack).usdc, credits: Number((item as CreditPack).credits) }]
      : [])
    : []
  return {
    enabled: v.enabled === true,
    ...(typeof v.feeAddress === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.feeAddress) ? { feeAddress: v.feeAddress } : {}),
    freeLeft: Number.isFinite(v.freeLeft) ? Math.max(0, Math.trunc(Number(v.freeLeft))) : 0,
    balance: Number.isFinite(v.balance) ? Math.max(0, Math.trunc(Number(v.balance))) : 0,
    costPerMessage: Number.isFinite(v.costPerMessage) && Number(v.costPerMessage) > 0 ? Math.trunc(Number(v.costPerMessage)) : 3,
    packs,
  }
}

export async function readCredits(fetcher: typeof fetch = fetch): Promise<CreditState> {
  try {
    const response = await fetcher(api('credits'), { credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) return EMPTY_CREDITS
    return parseCreditState(await response.json())
  } catch { return EMPTY_CREDITS }
}

/** Ask the server to read one Arc transaction and add its credits. Safe to retry while PENDING. */
export async function verifyTopUp(txHash: string, fetcher: typeof fetch = fetch): Promise<TopUpResult> {
  try {
    const response = await fetcher(api('credits/verify'), {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Makoto-Request': '1' },
      body: JSON.stringify({ txHash }),
    })
    const body = await response.json().catch(() => null) as Record<string, unknown> | null
    if (response.ok && body && typeof body.credits === 'number') {
      return { ok: true, credits: Number(body.credits), paidUsdc: Number(body.paidUsdc ?? 0), balance: Number(body.balance ?? 0), freeLeft: Number(body.freeLeft ?? 0) }
    }
    return { ok: false, code: typeof body?.code === 'string' ? body.code : 'CREDITS_UNAVAILABLE', error: typeof body?.error === 'string' ? body.error : 'Could not verify that top-up.', ...(typeof body?.minimum === 'number' ? { minimum: body.minimum } : {}) }
  } catch {
    return { ok: false, code: 'CREDITS_UNAVAILABLE', error: 'Could not reach the credit service.' }
  }
}

// ------------------------------------------------------------------ credit gifts
// A gift is a link the sender creates from their own balance. The server holds the
// credits until one friend claims them; unclaimed links return to the sender after 30 days.

export const CREDIT_GIFT_RE = /^[0-9a-f]{32}$/
export const MIN_GIFT_CREDITS = 10
export const GIFT_PRESETS = [25, 50, 100, 200] as const

export type CreditGiftInfo = Readonly<{
  id: string
  credits: number
  note: string
  from: string
  claimed: boolean
  expired: boolean
  expiresAt: number
}>
export type CreditGiftResult = Readonly<
  { ok: true; id: string; credits: number; expiresAt: number; state: CreditState } |
  { ok: false; code: string; error: string }
>

function giftIdFrom(value: string): string | null {
  const id = value.trim().toLowerCase()
  return CREDIT_GIFT_RE.test(id) ? id : null
}

/** `#credit-<id>` is the shareable link a friend opens. */
export function creditGiftIdFromHash(hash: string): string | null {
  const match = /^#credit-([0-9a-fA-F]{32})$/.exec(hash.trim())
  return match ? match[1].toLowerCase() : null
}

export function creditGiftLink(id: string): string {
  const origin = typeof window === 'undefined' ? 'https://makotowallet.xyz/' : `${window.location.origin}${window.location.pathname}`
  return `${origin}#credit-${id}`
}

export async function createCreditGift({ credits, note }: { credits: number; note?: string }, fetcher: typeof fetch = fetch): Promise<CreditGiftResult> {
  try {
    const response = await fetcher(api('credits/gift'), {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Makoto-Request': '1' },
      body: JSON.stringify({ credits, note: note ?? '' }),
    })
    const body = await response.json().catch(() => null) as Record<string, unknown> | null
    if (response.ok && body && typeof body.id === 'string') {
      return { ok: true, id: body.id, credits: Number(body.credits ?? credits), expiresAt: Number(body.expiresAt ?? 0), state: parseCreditState(body) }
    }
    return { ok: false, code: typeof body?.code === 'string' ? body.code : 'CREDITS_UNAVAILABLE', error: typeof body?.error === 'string' ? body.error : 'Could not create that gift link.' }
  } catch {
    return { ok: false, code: 'CREDITS_UNAVAILABLE', error: 'Could not reach the credit service.' }
  }
}

export async function readCreditGift(id: string, fetcher: typeof fetch = fetch): Promise<CreditGiftInfo | null> {
  const key = giftIdFrom(id)
  if (!key) return null
  try {
    const response = await fetcher(api(`credits/gift/${key}`), { credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) return null
    const body = await response.json() as Record<string, unknown>
    return {
      id: key,
      credits: Number.isFinite(body.credits) ? Math.max(0, Math.trunc(Number(body.credits))) : 0,
      note: typeof body.note === 'string' ? body.note : '',
      from: typeof body.from === 'string' ? body.from : '',
      claimed: body.claimed === true,
      expired: body.expired === true,
      expiresAt: Number.isFinite(body.expiresAt) ? Number(body.expiresAt) : 0,
    }
  } catch { return null }
}

export async function claimCreditGift(id: string, fetcher: typeof fetch = fetch): Promise<CreditGiftResult> {
  const key = giftIdFrom(id)
  if (!key) return { ok: false, code: 'INVALID', error: 'That gift link is not valid.' }
  try {
    const response = await fetcher(api('credits/gift/claim'), {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Makoto-Request': '1' },
      body: JSON.stringify({ id: key }),
    })
    const body = await response.json().catch(() => null) as Record<string, unknown> | null
    if (response.ok && body && typeof body.credits === 'number') {
      return { ok: true, id: key, credits: Number(body.credits), expiresAt: 0, state: parseCreditState(body) }
    }
    return { ok: false, code: typeof body?.code === 'string' ? body.code : 'CREDITS_UNAVAILABLE', error: typeof body?.error === 'string' ? body.error : 'Could not claim that gift.' }
  } catch {
    return { ok: false, code: 'CREDITS_UNAVAILABLE', error: 'Could not reach the credit service.' }
  }
}

export type SentCreditGift = Readonly<{ id: string; credits: number; note: string; createdAt: number; expiresAt: number; claimed: boolean; expired: boolean }>

export async function readSentCreditGifts(fetcher: typeof fetch = fetch): Promise<SentCreditGift[]> {
  try {
    const response = await fetcher(api('credits/gifts'), { credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) return []
    const body = await response.json() as { gifts?: unknown }
    if (!Array.isArray(body.gifts)) return []
    return body.gifts.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const v = item as Record<string, unknown>
      if (typeof v.id !== 'string' || !CREDIT_GIFT_RE.test(v.id)) return []
      return [{
        id: v.id,
        credits: Number.isFinite(v.credits) ? Math.max(0, Math.trunc(Number(v.credits))) : 0,
        note: typeof v.note === 'string' ? v.note : '',
        createdAt: Number(v.createdAt ?? 0),
        expiresAt: Number(v.expiresAt ?? 0),
        claimed: v.claimed === true,
        expired: v.expired === true,
      }]
    })
  } catch { return [] }
}

/** Can this wallet send one more Agent message right now? */
export function canAfford(state: CreditState | undefined): boolean {
  if (!state || !state.enabled) return true
  return state.freeLeft > 0 || state.balance >= state.costPerMessage
}
