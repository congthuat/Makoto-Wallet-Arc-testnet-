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

/** Can this wallet send one more Agent message right now? */
export function canAfford(state: CreditState | undefined): boolean {
  if (!state || !state.enabled) return true
  return state.freeLeft > 0 || state.balance >= state.costPerMessage
}
