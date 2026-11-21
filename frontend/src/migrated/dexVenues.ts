import { encodeFunctionData, getAddress, type Address, type Hex } from 'viem'

/** Curve StableSwap-NG pools on Arc Testnet, created by the Curve factory 0x8271…E8aD.
 * Only the two deepest USDC/EURC pools are allowed; the better one is picked per quote. */
export const CURVE_POOLS: readonly Address[] = [
  getAddress('0x0714027E44802b2Ff76389daF5371990CC3a4C24'),
  getAddress('0x2D84D79C852f6842AbE0304b70bBaA1506AdD457'),
]
export const curvePoolAbi = [
  { type: 'function', name: 'coins', stateMutability: 'view', inputs: [{ name: 'i', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'get_dy', stateMutability: 'view', inputs: [{ name: 'i', type: 'int128' }, { name: 'j', type: 'int128' }, { name: 'dx', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'exchange', stateMutability: 'nonpayable', inputs: [{ name: 'i', type: 'int128' }, { name: 'j', type: 'int128' }, { name: 'dx', type: 'uint256' }, { name: 'min_dy', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
] as const
/** Coin order of each allowed pool (verified on-chain), so indexes never come from user input. */
const CURVE_COINS: Record<string, readonly [string, string]> = {
  [CURVE_POOLS[0].toLowerCase()]: ['0x3600000000000000000000000000000000000000', '0x89b50855aa3be2f677cd6303cec089b5f319d72a'],
  [CURVE_POOLS[1].toLowerCase()]: ['0x3600000000000000000000000000000000000000', '0x89b50855aa3be2f677cd6303cec089b5f319d72a'],
}
export const isCurvePool = (pool: string) => CURVE_POOLS.some((item) => item.toLowerCase() === pool.toLowerCase())
export function curveIndexes(pool: Address, tokenIn: Address, tokenOut: Address): [bigint, bigint] {
  const coins = CURVE_COINS[pool.toLowerCase()]
  if (!coins) throw new Error('Untrusted Curve pool')
  const i = coins.indexOf(tokenIn.toLowerCase()); const j = coins.indexOf(tokenOut.toLowerCase())
  if (i < 0 || j < 0 || i === j) throw new Error('Unsupported Curve pair')
  return [BigInt(i), BigInt(j)]
}
export const curveQuoteCall = (pool: Address, tokenIn: Address, tokenOut: Address, amountIn: bigint): Hex => {
  const [i, j] = curveIndexes(pool, tokenIn, tokenOut)
  return encodeFunctionData({ abi: curvePoolAbi, functionName: 'get_dy', args: [i, j, amountIn] })
}
/** exchange() pays the output to msg.sender, i.e. the signer only. */
export const curveSwapCalldata = (pool: Address, tokenIn: Address, tokenOut: Address, amountIn: bigint, minimumReceive: bigint): Hex => {
  const [i, j] = curveIndexes(pool, tokenIn, tokenOut)
  if (amountIn <= 0n || minimumReceive <= 0n) throw new Error('Quote mismatch')
  return encodeFunctionData({ abi: curvePoolAbi, functionName: 'exchange', args: [i, j, amountIn, minimumReceive] })
}

/** "Arc Swap": verified UniswapV2Router02 + factory on Arc Testnet (community deployment, small liquidity). */
export const ARCSWAP_ROUTER = getAddress('0xe27d5d256b370604f1ff060fb489c6a8e3f8a6d9')
export const ARCSWAP_PAIR = getAddress('0xb3685D16AAa06361ED28377b1319136650Fa9A13')
export const v2RouterAbi = [
  { type: 'function', name: 'getAmountsOut', stateMutability: 'view', inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'path', type: 'address[]' }], outputs: [{ name: 'amounts', type: 'uint256[]' }] },
  { type: 'function', name: 'swapExactTokensForTokens', stateMutability: 'nonpayable', inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'amountOutMin', type: 'uint256' }, { name: 'path', type: 'address[]' }, { name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' }], outputs: [{ name: 'amounts', type: 'uint256[]' }] },
] as const
export const arcSwapQuoteCall = (tokenIn: Address, tokenOut: Address, amountIn: bigint): Hex =>
  encodeFunctionData({ abi: v2RouterAbi, functionName: 'getAmountsOut', args: [amountIn, [getAddress(tokenIn), getAddress(tokenOut)]] })
/** Output goes to the signer's own account; path is the direct USDC/EURC pair only. */
export const arcSwapCalldata = (tokenIn: Address, tokenOut: Address, amountIn: bigint, minimumReceive: bigint, recipient: Address, deadline: bigint): Hex => {
  if (amountIn <= 0n || minimumReceive <= 0n) throw new Error('Quote mismatch')
  return encodeFunctionData({ abi: v2RouterAbi, functionName: 'swapExactTokensForTokens', args: [amountIn, minimumReceive, [getAddress(tokenIn), getAddress(tokenOut)], getAddress(recipient), deadline] })
}
