import test from 'node:test'
import assert from 'node:assert/strict'
import { canAfford, EMPTY_CREDITS, parseCreditState, readCredits, USDC_ADDRESS, usdcUnits, verifyTopUp, usdcTransferData } from './credits.ts'

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

test('a top-up sends the transfer call to the USDC contract, not to the fee address', () => {
  assert.equal(USDC_ADDRESS, '0x3600000000000000000000000000000000000000')
  const fee = '0x16299b74c616994eaecb9b20e37d369d5d62586b'
  assert.notEqual(USDC_ADDRESS.toLowerCase(), fee)
  // The fee address belongs in the calldata only.
  assert.match(usdcTransferData(fee, 1_000_000n), new RegExp(fee.slice(2)))
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

import { claimCreditGift, createCreditGift, creditGiftIdFromHash, readCreditGift, readSentCreditGifts } from './credits.ts'

const GIFT_ID = 'a'.repeat(32)

test('a gift link is recognised only in the exact #credit-<32 hex> shape', () => {
  assert.equal(creditGiftIdFromHash(`#credit-${GIFT_ID}`), GIFT_ID)
  assert.equal(creditGiftIdFromHash(`#credit-${'A'.repeat(32)}`), GIFT_ID)
  assert.equal(creditGiftIdFromHash('#credit-abc'), null)
  assert.equal(creditGiftIdFromHash(`#gift-1-${'b'.repeat(64)}`), null)
  assert.equal(creditGiftIdFromHash(''), null)
})

test('creating a gift reads the new balance from the server', async () => {
  const calls: { url: string; body: unknown }[] = []
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
    return new Response(JSON.stringify({ ok: true, id: GIFT_ID, credits: 25, expiresAt: 1_800_000_000_000, enabled: true, freeLeft: 2, balance: 75, costPerMessage: 3, packs: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
  const result = await createCreditGift({ credits: 25, note: 'cà phê' }, fetcher)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.id, GIFT_ID)
  assert.equal(result.state.balance, 75)
  assert.deepEqual(calls[0].body, { credits: 25, note: 'cà phê' })
})

test('a refused gift keeps its error code for the UI', async () => {
  const fetcher = (async () => new Response(JSON.stringify({ code: 'INSUFFICIENT', error: 'Not enough credits.' }), { status: 409, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch
  const result = await createCreditGift({ credits: 999 }, fetcher)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, 'INSUFFICIENT')
  assert.equal(result.error, 'Not enough credits.')
})

test('a gift card is parsed safely and bad ids never hit the network', async () => {
  let called = 0
  const fetcher = (async () => {
    called += 1
    return new Response(JSON.stringify({ id: GIFT_ID, credits: 40, note: 'hi', from: '0x1111111111111111111111111111111111111111', claimed: false, expired: false, expiresAt: 1_800_000_000_000 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
  const gift = await readCreditGift(GIFT_ID, fetcher)
  assert.equal(gift?.credits, 40)
  assert.equal(gift?.claimed, false)
  assert.equal(await readCreditGift('not-an-id', fetcher), null)
  assert.equal(called, 1)
})

test('sent gifts ignore malformed rows', async () => {
  const fetcher = (async () => new Response(JSON.stringify({ gifts: [{ id: GIFT_ID, credits: 20, note: '', createdAt: 1, expiresAt: 2, claimed: false, expired: false }, { id: 'bad' }, null] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch
  const gifts = await readSentCreditGifts(fetcher)
  assert.equal(gifts.length, 1)
  assert.equal(gifts[0].credits, 20)
})

test('claiming returns the received amount and the new state', async () => {
  const fetcher = (async () => new Response(JSON.stringify({ ok: true, credits: 30, enabled: true, freeLeft: 1, balance: 30, costPerMessage: 3, packs: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch
  const result = await claimCreditGift(GIFT_ID, fetcher)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.credits, 30)
  assert.equal(result.state.balance, 30)
})
