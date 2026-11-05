import test from 'node:test'
import assert from 'node:assert/strict'
import { canAfford, EMPTY_CREDITS, parseCreditState, readCredits, usdcUnits, verifyTopUp, usdcTransferData } from './credits.ts'

test('USDC amounts become 6-decimal units', () => {
  assert.equal(usdcUnits('1'), 1_000_000n)
  assert.equal(usdcUnits('5'), 5_000_000n)
  assert.equal(usdcUnits('0.25'), 250_000n)
  assert.equal(usdcUnits('1.000001'), 1_000_001n)
  assert.equal(usdcUnits('0'), null)
  assert.equal(usdcUnits('1.0000001'), null)
  assert.equal(usdcUnits('-1'), null)
  assert.equal(usdcUnits('abc'), null)
})

test('top-up calldata targets the recipient with the exact amount', () => {
  const data = usdcTransferData('0x16299b74c616994eaecb9b20e37d369d5d62586b', 5_000_000n)
  assert.match(data, /^0xa9059cbb/)
  assert.match(data, /16299b74c616994eaecb9b20e37d369d5d62586b/)
  assert.ok(data.endsWith('4c4b40')) // 5,000,000 in hex
})

test('server credit state is validated, not trusted', () => {
  const state = parseCreditState({ enabled: true, feeAddress: '0x16299b74c616994eaecb9b20e37d369d5d62586b', freeLeft: 4.9, balance: -3, costPerMessage: 0, packs: [{ usdc: '1', credits: 100 }, { usdc: 'x' }] })
  assert.equal(state.enabled, true)
  assert.equal(state.freeLeft, 4)
  assert.equal(state.balance, 0)
  assert.equal(state.costPerMessage, 3)
  assert.deepEqual(state.packs, [{ usdc: '1', credits: 100 }])
  assert.equal(parseCreditState(null).enabled, false)
  assert.equal(parseCreditState({ enabled: 'yes' }).enabled, false)
})

test('affordability follows the free allowance then credits', () => {
  assert.equal(canAfford(undefined), true)
  assert.equal(canAfford(EMPTY_CREDITS), true)
  const base = { enabled: true, freeLeft: 0, balance: 0, costPerMessage: 3 }
  assert.equal(canAfford(base), false)
  assert.equal(canAfford({ ...base, freeLeft: 1 }), true)
  assert.equal(canAfford({ ...base, balance: 3 }), true)
  assert.equal(canAfford({ ...base, balance: 2 }), false)
})

test('a failed credit request never breaks the chat', async () => {
  const failing = (async () => { throw new Error('offline') }) as unknown as typeof fetch
  assert.equal((await readCredits(failing)).enabled, false)
  const result = await verifyTopUp('0xabc', failing)
  assert.equal(result.ok, false)
})
