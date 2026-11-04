/**
 * Makoto gift links ("lì xì"): fund a gift once, share a link, friends claim a share.
 *
 * The link carries a one-time key in the URL hash (`#gift-<id>-<key>`), which browsers never send
 * to a server. The contract only stores that key's address. To claim, the browser signs
 * claimHash(id, recipient) with the link key — no wallet signature is needed — and either the
 * Makoto fee helper (relayer) or the recipient's own wallet submits it. The signature binds the
 * recipient, so whoever submits it cannot redirect the money.
 */
import { decodeEventLog, decodeFunctionResult, encodeAbiParameters, encodeDeployData, encodeFunctionData, getAddress, getContractAddress, keccak256, toBytes, concat, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { arcRpc } from './arcRpc.ts'
import { ARC } from './wallet.ts'
import { PAY_TOKENS, type PayToken } from './payRequests.ts'
import { MAKOTO_GIFTS_ABI, MAKOTO_GIFTS_BYTECODE } from '../contracts/makotoGifts.ts'
import { api } from './api.ts'

/** Arachnid deterministic-deployment proxy (present on Arc Testnet). */
export const CREATE2_PROXY: Address = '0x4e59b44847b379578588920cA78FbF26c0B4956C'
export const GIFTS_SALT: Hex = keccak256(toBytes('makoto.gifts.v1'))
/** Fixed address: anyone may deploy the identical contract once; the result is always here. */
export const GIFTS_ADDRESS: Address = '0x330f86077F90f52Ad72BEeD924383403bC5874ED'
export const MAX_SHARES = 50
const MINE_KEY = 'mk.gifts.mine.v1'

export type GiftStatus = 'open' | 'empty' | 'refunded' | 'expired'
export type Gift = Readonly<{
  id: bigint; creator: Address; token: PayToken; decimals: number; total: bigint; claimedAmount: bigint; claimSigner: Address
  expiresAt: number; shareCount: number; claimedCount: number; refunded: boolean; memo: string; shares: bigint[]; claimers: Address[]; status: GiftStatus
}>

const STATUS: GiftStatus[] = ['open', 'empty', 'refunded', 'expired']

// ---------------------------------------------------------------- deployment
export const giftsInitCode = (): Hex => encodeDeployData({ abi: MAKOTO_GIFTS_ABI, bytecode: MAKOTO_GIFTS_BYTECODE, args: [PAY_TOKENS.USDC.address, PAY_TOKENS.EURC.address] })
export const predictedGiftsAddress = (): Address => getContractAddress({ opcode: 'CREATE2', from: CREATE2_PROXY, salt: GIFTS_SALT, bytecode: giftsInitCode() })
/** Calldata for the proxy: salt ++ initcode. */
export const giftsDeployData = (): Hex => concat([GIFTS_SALT, giftsInitCode()])

async function call(to: Address, data: Hex): Promise<Hex> {
  const result = await arcRpc('eth_call', [{ to, data }, 'latest'])
  if (typeof result !== 'string' || !result.startsWith('0x')) throw new Error('Invalid eth_call result')
  return result as Hex
}

/** True when the gift contract exists at the fixed address and is bound to Arc USDC/EURC. */
export async function giftsDeployed(): Promise<boolean> {
  try {
    const code = await arcRpc('eth_getCode', [GIFTS_ADDRESS, 'latest'])
    if (typeof code !== 'string' || code.length < 100) return false
    const read = async (functionName: 'tokenA' | 'tokenB') => decodeFunctionResult({ abi: MAKOTO_GIFTS_ABI, functionName, data: await call(GIFTS_ADDRESS, encodeFunctionData({ abi: MAKOTO_GIFTS_ABI, functionName })) })
    const [a, b] = await Promise.all([read('tokenA'), read('tokenB')])
    return getAddress(a as string) === PAY_TOKENS.USDC.address && getAddress(b as string) === PAY_TOKENS.EURC.address
  } catch { return false }
}

// ---------------------------------------------------------------- reads
export async function readGift(id: bigint): Promise<Gift | null> {
  let data: Hex
  try { data = await call(GIFTS_ADDRESS, encodeFunctionData({ abi: MAKOTO_GIFTS_ABI, functionName: 'getGift', args: [id] })) }
  catch { return null }
  const [g, memo, shares, claimers, status] = decodeFunctionResult({ abi: MAKOTO_GIFTS_ABI, functionName: 'getGift', data }) as unknown as [
    { creator: Address; total: bigint; token: Address; claimedAmount: bigint; claimSigner: Address; expiresAt: bigint; shareCount: number; claimedCount: number; refunded: boolean },
    string, readonly bigint[], readonly Address[], number,
  ]
  const token: PayToken | null = getAddress(g.token) === PAY_TOKENS.USDC.address ? 'USDC' : getAddress(g.token) === PAY_TOKENS.EURC.address ? 'EURC' : null
  if (!token) return null
  return {
    id, creator: getAddress(g.creator), token, decimals: PAY_TOKENS[token].decimals, total: g.total, claimedAmount: g.claimedAmount, claimSigner: getAddress(g.claimSigner),
    expiresAt: Number(g.expiresAt), shareCount: Number(g.shareCount), claimedCount: Number(g.claimedCount), refunded: g.refunded, memo,
    shares: [...shares], claimers: claimers.map((a) => getAddress(a)), status: STATUS[status] ?? 'open',
  }
}

// ---------------------------------------------------------------- splitting
/** Equal split; any leftover units go to the first shares so the sum is exact. */
export function splitEqual(total: bigint, count: number): bigint[] {
  const n = BigInt(count)
  const base = total / n
  const extra = total % n
  return Array.from({ length: count }, (_, i) => base + (BigInt(i) < extra ? 1n : 0n))
}

/** "Lucky" split: random shares, each at least `min` units, summing exactly to `total`. */
export function splitRandom(total: bigint, count: number, min: bigint, rand: () => number = secureRandom): bigint[] {
  if (min * BigInt(count) > total) return splitEqual(total, count)
  const spare = total - min * BigInt(count)
  const weights = Array.from({ length: count }, () => 0.15 + rand())
  const sum = weights.reduce((a, b) => a + b, 0)
  const shares = weights.map((w) => min + (spare * BigInt(Math.floor((w / sum) * 1_000_000))) / 1_000_000n)
  const used = shares.reduce((a, b) => a + b, 0n)
  shares[Math.floor(rand() * count) % count] += total - used
  return shares
}
function secureRandom(): number {
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  return buf[0] / 2 ** 32
}

export function parseUnitsText(text: string, decimals: number): bigint | null {
  const value = text.trim()
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d+)?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  if (fraction.length > decimals) return null
  const amount = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0')
  return amount > 0n && amount < 2n ** 96n ? amount : null
}

// ---------------------------------------------------------------- calldata
export const createGiftData = (input: { token: PayToken; shares: bigint[]; claimSigner: Address; expiresAt: number; memo: string }): Hex =>
  encodeFunctionData({ abi: MAKOTO_GIFTS_ABI, functionName: 'createGift', args: [PAY_TOKENS[input.token].address, input.shares, input.claimSigner, BigInt(input.expiresAt), input.memo] })
export const claimData = (id: bigint, recipient: Address, signature: Hex): Hex => encodeFunctionData({ abi: MAKOTO_GIFTS_ABI, functionName: 'claim', args: [id, recipient, signature] })
export const refundData = (id: bigint): Hex => encodeFunctionData({ abi: MAKOTO_GIFTS_ABI, functionName: 'refund', args: [id] })

// ---------------------------------------------------------------- link key & signature
export function newLinkKey(): { key: Hex; signer: Address } {
  const key = generatePrivateKey()
  return { key, signer: privateKeyToAccount(key).address }
}
export const linkSigner = (key: Hex): Address => privateKeyToAccount(key).address

/** Same as the contract's claimHash(id, recipient). */
export function claimHash(id: bigint, recipient: Address, chainId: number = ARC.chainId, contract: Address = GIFTS_ADDRESS): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }, { type: 'address' }],
    [keccak256(toBytes('MakotoGift.claim')), BigInt(chainId), contract, id, getAddress(recipient)],
  ))
}
export async function claimSignature(key: Hex, id: bigint, recipient: Address): Promise<Hex> {
  return privateKeyToAccount(key).signMessage({ message: { raw: claimHash(id, recipient) } })
}

export function giftLink(id: bigint, key: Hex): string {
  const hash = `#gift-${id}-${key.slice(2)}`
  if (typeof window === 'undefined') return hash
  return `${window.location.origin}${window.location.pathname}${hash}`
}
export function giftFromHash(hash: string): { id: bigint; key: Hex } | null {
  const match = /^#?gift-(\d{1,20})-([0-9a-fA-F]{64})$/.exec(hash)
  return match ? { id: BigInt(match[1]), key: `0x${match[2].toLowerCase()}` as Hex } : null
}

// ---------------------------------------------------------------- receipts
type Log = { address?: string; topics?: Hex[]; data?: Hex }
function eventsFrom(receipt: Record<string, unknown> | undefined) {
  const logs = Array.isArray(receipt?.logs) ? receipt.logs as Log[] : []
  return logs.flatMap((log) => {
    if (!log.address || getAddress(log.address) !== GIFTS_ADDRESS || !log.topics?.length) return []
    try { return [decodeEventLog({ abi: MAKOTO_GIFTS_ABI, topics: log.topics as [Hex, ...Hex[]], data: log.data ?? '0x' })] } catch { return [] }
  })
}
export function createdGiftId(receipt: Record<string, unknown> | undefined, creator: Address, signer: Address): bigint | null {
  const event = eventsFrom(receipt).find((e) => e.eventName === 'GiftCreated'
    && getAddress((e.args as { creator: Address }).creator) === getAddress(creator)
    && getAddress((e.args as { claimSigner: Address }).claimSigner) === getAddress(signer))
  return event ? (event.args as { id: bigint }).id : null
}
export function claimedAmount(receipt: Record<string, unknown> | undefined, id: bigint, recipient: Address): bigint | null {
  const event = eventsFrom(receipt).find((e) => e.eventName === 'Claimed' && (e.args as { id: bigint }).id === id && getAddress((e.args as { recipient: Address }).recipient) === getAddress(recipient))
  return event ? (event.args as { amount: bigint }).amount : null
}
export function refundedMatches(receipt: Record<string, unknown> | undefined, id: bigint): boolean {
  return eventsFrom(receipt).some((e) => e.eventName === 'Refunded' && (e.args as { id: bigint }).id === id)
}

// ---------------------------------------------------------------- fee helper (backend relayer)
export type RelayerStatus = { enabled: boolean; address?: Address; contractDeployed?: boolean; balance?: string; low?: boolean }
export async function relayerStatus(): Promise<RelayerStatus> {
  try {
    const res = await fetch(api('gifts/relayer'))
    return res.ok ? await res.json() as RelayerStatus : { enabled: false }
  } catch { return { enabled: false } }
}
export async function relayClaim(id: bigint, recipient: Address, signature: Hex): Promise<{ hash: Hex } | { error: string; code?: string }> {
  try {
    const res = await fetch(api('gifts/claim'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: id.toString(), recipient, signature }) })
    const body = await res.json().catch(() => ({})) as { hash?: string; error?: string; code?: string }
    if (res.ok && typeof body.hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(body.hash)) return { hash: body.hash as Hex }
    return { error: body.error ?? 'The fee helper is unavailable.', code: body.code }
  } catch { return { error: 'The fee helper is unavailable.', code: 'NETWORK' } }
}

// ---------------------------------------------------------------- my gifts (this device only)
export type MyGift = { id: string; key: string }
export function myGifts(account: string | undefined): MyGift[] {
  if (!account) return []
  try {
    const all = JSON.parse(localStorage.getItem(MINE_KEY) ?? '{}') as Record<string, MyGift[]>
    return (all[account.toLowerCase()] ?? []).filter((g) => /^\d+$/.test(g.id) && /^0x[0-9a-f]{64}$/.test(g.key))
  } catch { return [] }
}
export function rememberMyGift(account: string, id: bigint, key: Hex) {
  try {
    const all = JSON.parse(localStorage.getItem(MINE_KEY) ?? '{}') as Record<string, MyGift[]>
    const k = account.toLowerCase()
    all[k] = [{ id: id.toString(), key: key.toLowerCase() }, ...(all[k] ?? []).filter((g) => g.id !== id.toString())].slice(0, 50)
    localStorage.setItem(MINE_KEY, JSON.stringify(all))
  } catch { /* storage blocked */ }
}
