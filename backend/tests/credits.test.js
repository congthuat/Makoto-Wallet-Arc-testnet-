const test = require('node:test')
const assert = require('node:assert/strict')
const { CreditStore } = require('../lib/creditStore')
const { creditsFor } = require('../lib/agentFees')

const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'
const TX = `0x${'ab'.repeat(32)}`

function store(now = () => Date.UTC(2026, 10, 5, 12)) {
  return new CreditStore({ dbPath: ':memory:', now })
}

test('credit packs match their bonus tiers', () => {
  assert.equal(creditsFor(1_000_000n), 100) // 1 USDC
  assert.equal(creditsFor(5_000_000n), 550) // +10%
  assert.equal(creditsFor(10_000_000n), 1200) // +20%
  assert.equal(creditsFor(25_000_000n), 3250) // +30%
  assert.equal(creditsFor(0n), 0)
})

test('a payment is credited once and its balance is per wallet', () => {
  const db = store()
  assert.deepEqual(db.grant({ txHash: TX, address: A, usdcUnits: '5000000', credits: 550 }), { credited: true, balance: 550 })
  assert.equal(db.balance(A), 550)
  assert.equal(db.balance(B), 0)
  assert.deepEqual(db.grant({ txHash: TX, address: A, usdcUnits: '5000000', credits: 550 }), { credited: false })
  assert.equal(db.balance(A), 550)
  assert.equal(db.hasPayment(TX), true)
})

test('free messages come first, then credits, and never go negative', () => {
  const db = store()
  for (let i = 0; i < 5; i += 1) assert.equal(db.charge(A, 3, 5).kind, 'free')
  assert.equal(db.charge(A, 3, 5).kind, 'none')
  db.grant({ txHash: TX, address: A, usdcUnits: '1000000', credits: 100 })
  assert.deepEqual(db.charge(A, 3, 5), { kind: 'credits', charged: 3, balance: 97, freeLeft: 0 })
  db.charge(A, 97, 5)
  assert.equal(db.balance(A), 0)
  assert.equal(db.charge(A, 3, 5).kind, 'none')
  assert.equal(db.balance(A), 0)
})

test('the free allowance resets on the next UTC day', () => {
  let now = Date.UTC(2026, 10, 5, 12)
  const db = new CreditStore({ dbPath: ':memory:', now: () => now })
  for (let i = 0; i < 5; i += 1) db.charge(A, 3, 5)
  assert.equal(db.freeLeft(A, 5), 0)
  now = Date.UTC(2026, 10, 6, 1)
  assert.equal(db.freeLeft(A, 5), 5)
  assert.equal(db.charge(A, 3, 5).kind, 'free')
})

test('anonymous visitors use their own free allowance', () => {
  const db = store()
  assert.equal(db.charge('anon:0123456789abcdef0123456789abcdef', 3, 5).kind, 'free')
  assert.equal(db.balance(A), 0)
})

test('only a verified wallet can spend paid credits', () => {
  const { canChat, chargeMessage, config } = require('../lib/agentFees')
  const db = store()
  const settings = { ...config(), enabled: true, freePerDay: 1, creditsPerMessage: 3 }
  db.grant({ txHash: TX, address: A, usdcUnits: '1000000', credits: 100 })
  const options = (allowCredits) => ({ store: db, settings, allowCredits })

  // Unverified address: one free message, then blocked even with credits on the books.
  assert.equal(canChat(A, options(false)), true)
  assert.equal(chargeMessage(A, options(false))?.kind, 'free')
  assert.equal(canChat(A, options(false)), false)
  assert.equal(chargeMessage(A, options(false)), null)
  assert.equal(db.balance(A), 100)

  // Verified wallet: the same address now pays from its credits.
  assert.equal(chargeMessage(A, options(true))?.kind, 'credits')
  assert.equal(db.balance(A), 97)
})

test('billing turned off makes the Agent free', () => {
  const { canChat, chargeMessage, config } = require('../lib/agentFees')
  const settings = { ...config(), enabled: false }
  const db = store()
  assert.equal(canChat(A, { store: db, settings }), true)
  assert.equal(chargeMessage(A, { store: db, settings }), null)
})
