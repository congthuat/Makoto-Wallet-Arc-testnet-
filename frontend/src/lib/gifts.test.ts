import assert from 'node:assert/strict'
import test from 'node:test'
import { recoverMessageAddress } from 'viem'
import { GIFTS_ADDRESS, claimHash, claimSignature, giftFromHash, newLinkKey, parseUnitsText, predictedGiftsAddress, splitEqual, splitRandom } from './gifts.ts'

test('fixed gift address matches the CREATE2 prediction', () => {
  assert.equal(predictedGiftsAddress(), GIFTS_ADDRESS)
})

test('splits always sum exactly and respect the minimum', () => {
  assert.deepEqual(splitEqual(10n, 3), [4n, 3n, 3n])
  for (let i = 0; i < 200; i++) {
    const total = BigInt(1 + Math.floor(Math.random() * 1e9))
    const count = 1 + Math.floor(Math.random() * 50)
    const min = total / BigInt(count * 4)
    const shares = splitRandom(total, count, min)
    assert.equal(shares.length, count)
    assert.equal(shares.reduce((a, b) => a + b, 0n), total)
    assert.ok(shares.every((s) => s >= min && s > 0n || total < BigInt(count)))
  }
})

test('link parsing and claim signature recover to the link signer', async () => {
  const { key, signer } = newLinkKey()
  const parsed = giftFromHash(`#gift-7-${key.slice(2)}`)
  assert.equal(parsed?.id, 7n)
  assert.equal(parsed?.key, key)
  assert.equal(giftFromHash('#gift-7-abc'), null)
  const recipient = '0x000000000000000000000000000000000000dEaD'
  const signature = await claimSignature(key, 7n, recipient)
  assert.equal(await recoverMessageAddress({ message: { raw: claimHash(7n, recipient) }, signature }), signer)
})

test('amount parsing', () => {
  assert.equal(parseUnitsText('1.5', 6), 1_500_000n)
  assert.equal(parseUnitsText('0', 6), null)
  assert.equal(parseUnitsText('1.1234567', 6), null)
})
