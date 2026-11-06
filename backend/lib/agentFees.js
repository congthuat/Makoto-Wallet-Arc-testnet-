/**
 * Agent fees: the paid side of the Makoto Agent.
 *
 * The user tops up by sending USDC on Arc from their own wallet to the fee address.
 * This module reads that transfer back from the chain (sender, recipient, amount,
 * success) before any credit is added — the browser is never trusted for the amount.
 * Nothing here holds a key or moves funds.
 */
const { ethers } = require('ethers')
const crypto = require('node:crypto')
const { getCreditStore, keyOf, normaliseAddress, persistentDir } = require('./creditStore')

const ARC_RPC = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.io'
const ARC_CHAIN_ID = 5042002
/** Arc USDC ERC-20 (6 decimals). The native gas token is the same asset with 18 decimals. */
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000'
const USDC_DECIMALS = 6

const DEFAULT_FEE_ADDRESS = '0x16299b74c616994eaecb9b20e37d369d5d62586b'
const DEFAULT_FREE_PER_DAY = 5
const DEFAULT_CREDITS_PER_MESSAGE = 3
const MIN_TOP_UP_UNITS = 1_000_000n

/** Credit packs shown in the app. Bonus tiers match `creditsFor`. */
const PACKS = [
  { usdc: '1', credits: 100 },
  { usdc: '5', credits: 550 },
  { usdc: '10', credits: 1200 },
  { usdc: '25', credits: 3250 },
]

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)')

function intFromEnv(name, fallback, min, max) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback
}

function boolFromEnv(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  return !['0', 'false', 'off', 'no'].includes(String(raw).toLowerCase())
}

function configuredFeeAddress() {
  const raw = process.env.AGENT_FEE_ADDRESS || DEFAULT_FEE_ADDRESS
  const address = normaliseAddress(raw)
  if (address) return ethers.getAddress(address)
  // A broken fee address must not silently send money nowhere: billing turns itself off.
  console.error('AGENT_FEE_ADDRESS is not a valid address; Agent billing is disabled.')
  return null
}

/** Wallets that never pay (for example the owner's own wallet while testing). */
function freeAddresses() {
  const raw = process.env.AGENT_FEE_FREE_ADDRESSES || ''
  return new Set(raw.split(',').map((item) => normaliseAddress(item.trim())).filter(Boolean))
}

function config() {
  const feeAddress = configuredFeeAddress()
  return {
    enabled: boolFromEnv('AGENT_FEE_ENABLED', true) && Boolean(feeAddress),
    feeAddress,
    freePerDay: intFromEnv('AGENT_CREDITS_FREE_PER_DAY', DEFAULT_FREE_PER_DAY, 0, 1000),
    creditsPerMessage: intFromEnv('AGENT_CREDITS_PER_MESSAGE', DEFAULT_CREDITS_PER_MESSAGE, 1, 100),
    packs: PACKS,
    usdcAddress: USDC_ADDRESS,
  }
}

/**
 * 1 USDC = 100 credits, with the same bonus tiers as the packs:
 * 5 USDC → 550, 10 USDC → 1,200, 25 USDC → 3,250.
 */
function creditsFor(usdcUnits) {
  const units = typeof usdcUnits === 'bigint' ? usdcUnits : BigInt(usdcUnits)
  if (units <= 0n) return 0
  const whole = units / 1_000_000n
  const tier = whole >= 25n ? 130 : whole >= 10n ? 120 : whole >= 5n ? 110 : 100
  // Round down on the fraction so the user never gets more than they paid for.
  return Number((units * BigInt(tier)) / 1_000_000n)
}

let provider = null
function rpc() {
  if (!provider) provider = new ethers.JsonRpcProvider(ARC_RPC, ARC_CHAIN_ID, { staticNetwork: true })
  return provider
}

function usdcUnitsFromLogs(receipt, payer, feeAddress) {
  let total = 0n
  for (const log of receipt.logs || []) {
    if (String(log.address).toLowerCase() !== USDC_ADDRESS.toLowerCase()) continue
    if (!Array.isArray(log.topics) || log.topics[0] !== TRANSFER_TOPIC || log.topics.length < 3) continue
    const from = ethers.getAddress(`0x${log.topics[1].slice(26)}`)
    const to = ethers.getAddress(`0x${log.topics[2].slice(26)}`)
    if (from.toLowerCase() !== payer.toLowerCase() || to.toLowerCase() !== feeAddress.toLowerCase()) continue
    try { total += BigInt(log.data) } catch { /* malformed log */ }
  }
  return total
}

/**
 * Read one top-up transaction from Arc and turn it into credits.
 * Returns { ok: true, credited, credits, balance } or { ok: false, code }.
 * Codes: PENDING, FAILED, WRONG_SENDER, WRONG_RECIPIENT, TOO_SMALL, ALREADY_CREDITED.
 */
async function verifyTopUp({ txHash, payer, store = getCreditStore(), settings = config() }) {
  const hash = typeof txHash === 'string' ? txHash.trim() : ''
  const from = normaliseAddress(payer)
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return { ok: false, code: 'INVALID_TX' }
  if (!from) return { ok: false, code: 'AUTH_REQUIRED' }
  if (!settings.enabled) return { ok: false, code: 'BILLING_DISABLED' }
  if (store.hasPayment(hash)) return { ok: false, code: 'ALREADY_CREDITED', balance: store.balance(from) }

  let receipt
  try { receipt = await rpc().getTransactionReceipt(hash) }
  catch { return { ok: false, code: 'RPC_UNAVAILABLE' } }
  if (!receipt) return { ok: false, code: 'PENDING' }
  if (Number(receipt.status) !== 1) return { ok: false, code: 'FAILED' }

  const sender = String(receipt.from || '').toLowerCase()
  // The USDC Transfer log (from == the signed-in wallet) is what proves the payment.
  // A smart-contract wallet pays through a bundler, so receipt.from can differ from the
  // wallet that owns the USDC — do not reject on that alone.
  let units = usdcUnitsFromLogs(receipt, from, settings.feeAddress)
  // Also accept a plain native-USDC transfer to the fee address (18 decimals on Arc).
  const tx = await rpc().getTransaction(hash).catch(() => null)
  if (tx && String(tx.to || '').toLowerCase() === settings.feeAddress.toLowerCase() && String(tx.from || '').toLowerCase() === from) {
    const native = BigInt(tx.value || 0n)
    if (native > 0n) units += native / 1_000_000_000_000n
  }
  if (units <= 0n) return { ok: false, code: sender === from ? 'WRONG_RECIPIENT' : 'WRONG_SENDER' }
  if (units < MIN_TOP_UP_UNITS) return { ok: false, code: 'TOO_SMALL', minimum: Number(MIN_TOP_UP_UNITS) / 1e6 }

  const credits = creditsFor(units)
  if (credits <= 0) return { ok: false, code: 'TOO_SMALL', minimum: Number(MIN_TOP_UP_UNITS) / 1e6 }
  const granted = store.grant({ txHash: hash, address: from, usdcUnits: units.toString(), credits })
  if (!granted.credited) return { ok: false, code: 'ALREADY_CREDITED', balance: store.balance(from) }
  return { ok: true, credited: true, credits, paidUsdc: Number(units) / 1e6, balance: granted.balance }
}

/** What the app shows next to the chat box. */
function feeState(address, store = getCreditStore(), settings = config()) {
  const payer = keyOf(address)
  if (!settings.enabled) return { enabled: false, freeLeft: 0, balance: 0, costPerMessage: 0 }
  return {
    enabled: true,
    feeAddress: settings.feeAddress,
    freeLeft: payer ? store.freeLeft(payer, settings.freePerDay) : 0,
    balance: payer ? store.balance(payer) : 0,
    costPerMessage: settings.creditsPerMessage,
    packs: settings.packs,
  }
}

/**
 * Charge one Agent message to a wallet.
 * `allowCredits` stays false until the wallet has proven itself with a signature, so an
 * address typed into the page can only ever use the free daily allowance — never someone
 * else's paid credits.
 * Returns null when the wallet has nothing left, otherwise the charge receipt.
 */
function chargeMessage(address, options = {}) {
  const { store = getCreditStore(), settings = config(), allowCredits = true } = options
  const payer = keyOf(address)
  if (!settings.enabled || !payer) return null
  if (freeAddresses().has(payer)) return { kind: 'free', charged: 0, balance: store.balance(payer), freeLeft: store.freeLeft(payer, settings.freePerDay), owner: true }
  if (!allowCredits && store.freeLeft(payer, settings.freePerDay) <= 0) return null
  const receipt = store.charge(payer, settings.creditsPerMessage, settings.freePerDay)
  return receipt.kind === 'none' ? null : receipt
}

/** Cheap pre-check so a broke wallet never triggers a paid model call. */
function canChat(address, options = {}) {
  const { store = getCreditStore(), settings = config(), allowCredits = true } = options
  if (!settings.enabled) return true
  const payer = keyOf(address)
  if (!payer) return true
  if (freeAddresses().has(payer)) return true
  if (store.freeLeft(payer, settings.freePerDay) > 0) return true
  return allowCredits && store.balance(payer) >= settings.creditsPerMessage
}

/** Stable, non-reversible key for visitors without a wallet (free allowance only). */
function anonKey(ip) {
  return `anon:${crypto.createHash('sha256').update(String(ip || 'unknown')).digest('hex').slice(0, 32)}`
}

/**
 * Free-tier key for a request without a wallet. Behind nginx every request shares the
 * proxy address, so the forwarded client address is preferred. Spoofing it can only win a
 * few extra *free* messages — paid credits are bound to a signed-in wallet, never to this.
 */
function anonKeyFor(req) {
  const forwarded = typeof req?.headers?.['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0].trim() : ''
  return anonKey(forwarded || req?.ip)
}

module.exports = {
  ARC_CHAIN_ID,
  anonKey,
  anonKeyFor,
  DEFAULT_FEE_ADDRESS,
  MIN_TOP_UP_UNITS,
  PACKS,
  USDC_ADDRESS,
  canChat,
  chargeMessage,
  config,
  creditsFor,
  feeState,
  freeAddresses,
  normaliseAddress,
  persistentDir,
  verifyTopUp,
}
