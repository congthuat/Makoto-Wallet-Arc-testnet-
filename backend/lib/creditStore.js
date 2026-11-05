/**
 * Agent credits, paid for with USDC on Arc.
 *
 * One row per wallet keeps the balance. Every accepted payment is stored by transaction
 * hash, so the same transfer can never be credited twice. The free daily allowance is
 * counted per wallet per UTC day. Nothing here touches a private key: money moves from
 * the user's own wallet straight to the fee address, and this store only records what the
 * chain already confirmed.
 */
const fs = require('node:fs')
const path = require('node:path')
// Same runtime-neutral loading as vaultStore: built-in node:sqlite in production,
// the Bun shim in the preview sandbox.
let DatabaseSync
try { ({ DatabaseSync } = require('node:sqlite')) } catch { ({ DatabaseSync } = require('./sqlite')) }

const SQLITE_BUSY_TIMEOUT_MS = 5_000

function persistentDir() {
  if (process.env.TASK_AUTH_DB_PATH) return path.dirname(process.env.TASK_AUTH_DB_PATH)
  if (process.env.TASK_DB_PATH) return path.dirname(process.env.TASK_DB_PATH)
  return path.join(__dirname, '..', 'data')
}

function normaliseAddress(value) {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value) ? value.toLowerCase() : null
}

/**
 * Balance keys are wallet addresses. A visitor who has not connected a wallet is keyed by
 * "anon:<hash of IP>" so the free daily allowance still applies without letting anyone
 * spend another wallet's credits.
 */
function keyOf(value) {
  const address = normaliseAddress(value)
  if (address) return address
  return typeof value === 'string' && /^anon:[0-9a-f]{16,64}$/.test(value) ? value : null
}

function utcDay(now) {
  return new Date(now).toISOString().slice(0, 10)
}

class CreditStore {
  constructor(options = {}) {
    const filename = options.dbPath || process.env.AGENT_CREDITS_DB_PATH || path.join(persistentDir(), 'agent-credits.sqlite')
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true })
    this.db = new DatabaseSync(filename, { timeout: SQLITE_BUSY_TIMEOUT_MS })
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.now = options.now || (() => Date.now())
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS credit_balances (
        address TEXT PRIMARY KEY,
        credits INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS credit_payments (
        tx_hash TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        usdc_units TEXT NOT NULL,
        credits INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS credit_free_usage (
        address TEXT NOT NULL,
        day TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (address, day)
      );
    `)
  }

  balance(address) {
    const key = keyOf(address)
    if (!key) return 0
    const row = this.db.prepare('SELECT credits FROM credit_balances WHERE address = ?').get(key)
    return row ? Number(row.credits) : 0
  }

  freeUsedToday(address, now = this.now()) {
    const key = keyOf(address)
    if (!key) return 0
    const row = this.db.prepare('SELECT used FROM credit_free_usage WHERE address = ? AND day = ?').get(key, utcDay(now))
    return row ? Number(row.used) : 0
  }

  /** Free messages left today for this wallet (never negative). */
  freeLeft(address, freePerDay, now = this.now()) {
    return Math.max(0, freePerDay - this.freeUsedToday(address, now))
  }

  hasPayment(txHash) {
    const key = typeof txHash === 'string' ? txHash.toLowerCase() : ''
    if (!/^0x[0-9a-f]{64}$/.test(key)) return false
    return Boolean(this.db.prepare('SELECT 1 AS found FROM credit_payments WHERE tx_hash = ?').get(key))
  }

  /**
   * Record a verified on-chain payment and add its credits.
   * Returns { credited: false } when this transaction was already used.
   */
  grant({ txHash, address, usdcUnits, credits }) {
    const key = normaliseAddress(address)
    const hash = typeof txHash === 'string' ? txHash.toLowerCase() : ''
    if (!key || !/^0x[0-9a-f]{64}$/.test(hash)) throw new Error('Invalid payment record')
    const amount = Number(credits)
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid credit amount')
    const now = this.now()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const inserted = this.db.prepare('INSERT OR IGNORE INTO credit_payments (tx_hash, address, usdc_units, credits, created_at) VALUES (?, ?, ?, ?, ?)').run(hash, key, String(usdcUnits ?? ''), amount, now)
      if (!inserted.changes) { this.db.exec('ROLLBACK'); return { credited: false } }
      this.db.prepare('INSERT INTO credit_balances (address, credits, updated_at) VALUES (?, ?, ?) ON CONFLICT(address) DO UPDATE SET credits = credits + excluded.credits, updated_at = excluded.updated_at').run(key, amount, now)
      this.db.exec('COMMIT')
      return { credited: true, balance: this.balance(key) }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  /**
   * Take the free allowance first, then credits. `cost` credits are deducted only when the
   * whole amount is available, so a balance can never go negative.
   * Returns { kind: 'free' | 'credits', ...state } or { kind: 'none', ...state }.
   */
  charge(address, cost, freePerDay) {
    const key = keyOf(address)
    if (!key) return { kind: 'none', balance: 0, freeLeft: 0 }
    const now = this.now()
    const day = utcDay(now)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const usedRow = this.db.prepare('SELECT used FROM credit_free_usage WHERE address = ? AND day = ?').get(key, day)
      const used = usedRow ? Number(usedRow.used) : 0
      if (used < freePerDay) {
        this.db.prepare('INSERT INTO credit_free_usage (address, day, used) VALUES (?, ?, 1) ON CONFLICT(address, day) DO UPDATE SET used = used + 1').run(key, day)
        this.db.exec('COMMIT')
        return { kind: 'free', charged: 0, balance: this.balance(key), freeLeft: Math.max(0, freePerDay - (used + 1)) }
      }
      const step = this.db.prepare('UPDATE credit_balances SET credits = credits - ?, updated_at = ? WHERE address = ? AND credits >= ?').run(cost, now, key, cost)
      if (!step.changes) {
        this.db.exec('ROLLBACK')
        return { kind: 'none', charged: 0, balance: this.balance(key), freeLeft: 0 }
      }
      this.db.exec('COMMIT')
      return { kind: 'credits', charged: cost, balance: this.balance(key), freeLeft: 0 }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  /** Give back what charge() took when the answer never reached the user. */
  refund(address, receipt) {
    const key = keyOf(address)
    if (!key || !receipt) return
    const now = this.now()
    if (receipt.kind === 'credits' && Number(receipt.charged) > 0) {
      this.db.prepare('INSERT INTO credit_balances (address, credits, updated_at) VALUES (?, ?, ?) ON CONFLICT(address) DO UPDATE SET credits = credits + excluded.credits, updated_at = excluded.updated_at').run(key, Number(receipt.charged), now)
    }
  }

  close() { this.db.close() }
}

let singleton = null
function getCreditStore() {
  if (!singleton) singleton = new CreditStore()
  return singleton
}

module.exports = { CreditStore, getCreditStore, keyOf, normaliseAddress, utcDay, persistentDir }
