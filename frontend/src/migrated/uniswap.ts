import { decodeFunctionData, encodeAbiParameters, encodeFunctionData, getAddress, zeroAddress, type Address, type Hex } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getAssetById, type SupportedAssetId } from './assets.ts'
import type { SwapQuote, XyloSwappableAssetId } from './swap.ts'

/** Official Uniswap v4 deployment on Arc Testnet (verified contract code on-chain). */
export const UNI_ROUTER = getAddress('0x4fcA4a51Ab4F23A7447b3284fBd7D73289A89Fb1')
export const UNI_QUOTER = getAddress('0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94')
export const UNI_POOL_MANAGER = getAddress('0x8366a39CC670B4001A1121B8F6A443A643e40951')
export const PERMIT2 = getAddress('0x000000000022D473030F116dDEE9F6B43aC78BA3')
export const UNI_FEE = 500
export const UNI_TICK_SPACING = 10
/** Permit2 allowance to the router lasts 30 days; the amount is always the exact swap amount. */
export const PERMIT2_EXPIRY_SECONDS = 30 * 24 * 3600

export type SwapVenue = 'xylonet' | 'uniswap'
export type SwapVenueChoice = SwapVenue | 'best'
export const VENUE_LABEL: Record<SwapVenue, string> = { xylonet: 'XyloNet', uniswap: 'Uniswap v4' }

export const quoterAbi = [{
  type: 'function', name: 'quoteExactInputSingle', stateMutability: 'nonpayable',
  inputs: [{ name: 'params', type: 'tuple', components: [
    { name: 'poolKey', type: 'tuple', components: [{ name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' }] },
    { name: 'zeroForOne', type: 'bool' }, { name: 'exactAmount', type: 'uint128' }, { name: 'hookData', type: 'bytes' },
  ] }],
  outputs: [{ name: 'amountOut', type: 'uint256' }, { name: 'gasEstimate', type: 'uint256' }],
}] as const

export const permit2Abi = [
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'token', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }, { name: 'nonce', type: 'uint48' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }], outputs: [] },
] as const

export const universalRouterAbi = [{ type: 'function', name: 'execute', stateMutability: 'payable', inputs: [{ name: 'commands', type: 'bytes' }, { name: 'inputs', type: 'bytes[]' }, { name: 'deadline', type: 'uint256' }], outputs: [] }] as const

export function poolFor(tokenIn: Address, tokenOut: Address) {
  const [currency0, currency1] = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? [tokenIn, tokenOut] : [tokenOut, tokenIn]
  return { poolKey: { currency0: getAddress(currency0), currency1: getAddress(currency1), fee: UNI_FEE, tickSpacing: UNI_TICK_SPACING, hooks: zeroAddress }, zeroForOne: getAddress(currency0) === getAddress(tokenIn) }
}

export function uniswapQuoteCall(tokenIn: Address, tokenOut: Address, amountIn: bigint): Hex {
  const { poolKey, zeroForOne } = poolFor(tokenIn, tokenOut)
  return encodeFunctionData({ abi: quoterAbi, functionName: 'quoteExactInputSingle', args: [{ poolKey, zeroForOne, exactAmount: amountIn, hookData: '0x' }] })
}

export function createUniswapQuote(fromAssetId: XyloSwappableAssetId, toAssetId: XyloSwappableAssetId, amountIn: bigint, amountOut: bigint, quotedAt = Date.now()): SwapQuote {
  if (fromAssetId === toAssetId || amountIn <= 0n || amountOut <= 0n) throw new Error('Invalid Uniswap quote')
  return { fromAssetId, toAssetId, amountIn, amountOut, chainId: arcTestnet.id, router: UNI_ROUTER, pool: UNI_POOL_MANAGER, quotedAt }
}

const SWAP_EXACT_IN_SINGLE = 0x06
const SETTLE_ALL = 0x0c
const TAKE_ALL = 0x0f
const V4_SWAP = 0x10

/** V4_SWAP via Universal Router. Funds are pulled by Permit2 from the signer and paid to the signer only. */
export function buildUniswapSwapCalldata(quote: SwapQuote, minimumReceive: bigint, deadline: bigint): Hex {
  const from = getAssetById(quote.fromAssetId as SupportedAssetId); const to = getAssetById(quote.toAssetId as SupportedAssetId)
  if (!from || !to || quote.router !== UNI_ROUTER || quote.amountIn <= 0n || minimumReceive <= 0n || quote.amountIn >= 1n << 128n) throw new Error('Quote mismatch')
  const tokenIn = getAddress(from.address); const tokenOut = getAddress(to.address)
  const { poolKey, zeroForOne } = poolFor(tokenIn, tokenOut)
  const swapParams = encodeAbiParameters([{ type: 'tuple', components: [
    { name: 'poolKey', type: 'tuple', components: [{ name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' }] },
    { name: 'zeroForOne', type: 'bool' }, { name: 'amountIn', type: 'uint128' }, { name: 'amountOutMinimum', type: 'uint128' }, { name: 'minHopPriceX36', type: 'uint256' }, { name: 'hookData', type: 'bytes' },
  ] }], [{ poolKey, zeroForOne, amountIn: quote.amountIn, amountOutMinimum: minimumReceive, minHopPriceX36: 0n, hookData: '0x' }])
  const settle = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [tokenIn, quote.amountIn])
  const take = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [tokenOut, minimumReceive])
  const actions = `0x${[SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL].map((n) => n.toString(16).padStart(2, '0')).join('')}` as Hex
  const input = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, [swapParams, settle, take]])
  return encodeFunctionData({ abi: universalRouterAbi, functionName: 'execute', args: [`0x${V4_SWAP.toString(16)}` as Hex, [input], deadline] })
}

export function permit2ApproveCalldata(token: Address, amount: bigint, expiration: number): Hex {
  if (amount <= 0n || amount >= 1n << 160n) throw new Error('Approval must be finite')
  return encodeFunctionData({ abi: permit2Abi, functionName: 'approve', args: [getAddress(token), UNI_ROUTER, amount, expiration] })
}

/** Permit2 approval may only grant the official Universal Router an exact, short-lived amount. */
export function decodePermit2Approval(data: Hex): { token: Address; spender: Address; amount: bigint; expiration: number } | undefined {
  try {
    const decoded = decodeFunctionData({ abi: permit2Abi, data })
    if (decoded.functionName !== 'approve') return undefined
    const [token, spender, amount, expiration] = decoded.args
    return { token: getAddress(token), spender: getAddress(spender), amount, expiration: Number(expiration) }
  } catch { return undefined }
}

/** Percent difference between two outputs, relative to the better one. */
export function venueGap(a: bigint, b: bigint): number {
  const hi = a > b ? a : b; const lo = a > b ? b : a
  if (hi <= 0n) return 0
  return Number((hi - lo) * 10000n / hi) / 100
}
