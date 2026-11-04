import assert from 'node:assert/strict'
import test from 'node:test'
import { assessRecipient, checkRecipient } from './addressSafety.ts'

const FRIEND = '0xAbC1111111111111111111111111111111111dEf'
const FAKE = '0xabc2222222222222222222222222222222222def'
const STRANGER = '0x9999999999999999999999999999999999999999'

test('look-alike: same first 3 and last 3 characters, different middle', () => {
  assert.equal(checkRecipient(FAKE, [{ address: FRIEND }]).kind, 'lookalike')
  assert.equal(checkRecipient(FRIEND, [{ address: FRIEND }]).kind, 'known')
  assert.equal(checkRecipient(STRANGER, [{ address: FRIEND }]).kind, 'first-time')
})

test('contacts are trusted, look-alikes and dust senders are risks', () => {
  const contacts = [{ name: 'Lan', address: FRIEND }]
  assert.equal(assessRecipient({ recipient: FRIEND, contacts, activity: [] }).level, 'ok')
  const fake = assessRecipient({ recipient: FAKE, contacts, activity: [{ direction: 'in', counterparty: FAKE, amount: 0.000001 }] })
  assert.equal(fake.level, 'risk')
  assert.deepEqual(fake.signals.map((s) => s.id), ['lookalike', 'dust-sender', 'first-time'])
})

test('first-time and most-of-balance are warnings; sent-before is fine', () => {
  const r = assessRecipient({ recipient: STRANGER, contacts: [], activity: [], amount: 60, balance: 100 })
  assert.equal(r.level, 'warn')
  assert.ok(r.signals.some((s) => s.id === 'most-of-balance'))
  const again = assessRecipient({ recipient: STRANGER, contacts: [], activity: [{ direction: 'out', counterparty: STRANGER, amount: 5 }], amount: 60, balance: 100 })
  assert.equal(again.level, 'ok')
  const big = assessRecipient({ recipient: STRANGER, contacts: [], activity: [{ direction: 'out', counterparty: STRANGER }], usdValue: 150, largeUsd: 100 })
  assert.equal(big.level, 'warn')
})
