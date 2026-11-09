/**
 * Arc transaction extensions.
 *
 * `Memo` (0x5294…e505) lets a plain wallet attach a short note to a call without
 * handing custody to a contract: the precompile forwards the inner call and the
 * wallet stays `msg.sender`. `Multicall3From` (0x522f…47D0) does the same for a
 * batch, so several transfers can be approved with one wallet signature.
 *
 * Both are predeployed on Arc Testnet and Arc mainnet at the same address.
 */
import { encodeFunctionData, stringToHex, type Address, type Hex } from 'viem'

export const ARC_MEMO_ADDRESS = '0x5294E9927c3306DcBaDb03fe70b92e01cCede505' as Address
export const ARC_BATCH_ADDRESS = '0x522fAf9A91c41c443c66765030741e4AaCe147D0' as Address
export const MAX_MEMO_BYTES = 140

const MEMO_ABI = [{
  type: 'function', name: 'memo', stateMutability: 'nonpayable',
  inputs: [
    { name: 'target', type: 'address' },
    { name: 'data', type: 'bytes' },
    { name: 'memoId', type: 'bytes32' },
    { name: 'memoData', type: 'bytes' },
  ],
  outputs: [],
}] as const

const AGGREGATE_ABI = [{
  type: 'function', name: 'aggregate3', stateMutability: 'nonpayable',
  inputs: [{
    name: 'calls', type: 'tuple[]',
    components: [
      { name: 'target', type: 'address' },
      { name: 'allowFailure', type: 'bool' },
      { name: 'callData', type: 'bytes' },
    ],
  }],
  outputs: [{
    name: 'returnData', type: 'tuple[]',
    components: [{ name: 'success', type: 'bool' }, { name: 'returnData', type: 'bytes' }],
  }],
}] as const

const ZERO_MEMO_ID = `0x${'00'.repeat(32)}` as Hex

/** Byte length of a note, measured the way the chain stores it. */
export function memoBytes(note: string): number {
  try { return new TextEncoder().encode(note.trim()).length } catch { return note.trim().length }
}

/** Trim and cap a note so the transaction stays small. */
export function cleanMemo(note: string): string {
  const trimmed = note.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!trimmed) return ''
  let out = trimmed
  while (memoBytes(out) > MAX_MEMO_BYTES && out.length > 0) out = out.slice(0, -1)
  return out.trim()
}

/** Wrap an inner call so the note travels with it, on-chain. */
export function memoCall(target: Address, data: Hex, note: string): Hex {
  const text = cleanMemo(note)
  return encodeFunctionData({
    abi: MEMO_ABI,
    functionName: 'memo',
    args: [target, data, ZERO_MEMO_ID, stringToHex(text)],
  })
}

export type BatchCall = Readonly<{ target: Address; callData: Hex }>

/**
 * One signature for many transfers. `allowFailure: false` keeps the batch atomic:
 * if any transfer would fail, the whole transaction reverts and nothing moves.
 */
export function batchCallData(calls: readonly BatchCall[]): Hex {
  return encodeFunctionData({
    abi: AGGREGATE_ABI,
    functionName: 'aggregate3',
    args: [calls.map((call) => ({ target: call.target, allowFailure: false, callData: call.callData }))],
  })
}
