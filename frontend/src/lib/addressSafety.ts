/**
 * Address-poisoning guard. Scammers send dust from an address whose first and last
 * characters match one you use, hoping you copy it from history. We compare the
 * recipient with addresses the user already knows (contacts and past recipients).
 * Deterministic and local; no network or model involved.
 */
export type KnownAddress = Readonly<{ address: string; label?: string }>
export type RecipientCheck =
  | Readonly<{ kind: 'known'; label?: string }>
  | Readonly<{ kind: 'lookalike'; similarTo: KnownAddress }>
  | Readonly<{ kind: 'first-time' }>
  | Readonly<{ kind: 'invalid' }>

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
/** 3+3 hex chars: a random address matches a known one by chance about once in 16.7 million. */
const PREFIX = 3
const SUFFIX = 3

export function checkRecipient(recipient: string, known: readonly KnownAddress[]): RecipientCheck {
  const value = recipient.trim()
  if (!ADDRESS.test(value)) return { kind: 'invalid' }
  const lower = value.toLowerCase()
  const valid = known.filter((entry) => ADDRESS.test(entry.address))
  const exact = valid.find((entry) => entry.address.toLowerCase() === lower)
  if (exact) return { kind: 'known', label: exact.label }
  const head = lower.slice(2, 2 + PREFIX)
  const tail = lower.slice(-SUFFIX)
  const similar = valid.find((entry) => {
    const other = entry.address.toLowerCase()
    return other.slice(2, 2 + PREFIX) === head && other.slice(-SUFFIX) === tail
  })
  return similar ? { kind: 'lookalike', similarTo: similar } : { kind: 'first-time' }
}

/** Contacts first (they carry names), then distinct past outgoing counterparties. */
export function knownAddresses(contacts: readonly { name: string; address: string }[], activity: readonly { direction?: string; counterparty?: string; counterpartyName?: string | null }[]): KnownAddress[] {
  const seen = new Set<string>()
  const out: KnownAddress[] = []
  for (const contact of contacts) {
    const key = contact.address.toLowerCase()
    if (ADDRESS.test(contact.address) && !seen.has(key)) { seen.add(key); out.push({ address: contact.address, label: contact.name }) }
  }
  for (const item of activity) {
    const address = item.counterparty ?? ''
    const key = address.toLowerCase()
    if (item.direction === 'out' && ADDRESS.test(address) && !seen.has(key)) { seen.add(key); out.push({ address, label: item.counterpartyName ?? undefined }) }
  }
  return out
}

export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

// ---------------------------------------------------------------- full pre-send assessment
export type SafetyLevel = 'ok' | 'warn' | 'risk'
export type SafetySignal = Readonly<{
  id: 'contact' | 'sent-before' | 'lookalike' | 'dust-sender' | 'first-time' | 'large' | 'most-of-balance'
  level: SafetyLevel
  label?: string
  similarTo?: KnownAddress
}>
export type ActivityLike = { direction?: string; counterparty?: string; counterpartyName?: string | null; amount?: number }

/** An incoming transfer this small from a stranger is the classic address-poisoning bait. */
export const DUST_AMOUNT = 0.01

/**
 * Local, deterministic checks before a transfer. `risk` signals must be acknowledged by the user;
 * `warn` signals are shown; `ok` signals reassure. No network or model involved.
 */
export function assessRecipient(input: {
  recipient: string
  contacts: readonly { name: string; address: string }[]
  activity: readonly ActivityLike[]
  amount?: number
  balance?: number
  usdValue?: number
  largeUsd?: number
}): { level: SafetyLevel; signals: SafetySignal[] } {
  const signals: SafetySignal[] = []
  const value = input.recipient.trim()
  if (!ADDRESS.test(value)) return { level: 'ok', signals }
  const lower = value.toLowerCase()
  const contact = input.contacts.find((c) => c.address.toLowerCase() === lower)
  const sentBefore = input.activity.some((a) => a.direction === 'out' && a.counterparty?.toLowerCase() === lower)
  if (contact) signals.push({ id: 'contact', level: 'ok', label: contact.name })
  else if (sentBefore) signals.push({ id: 'sent-before', level: 'ok' })
  else {
    const check = checkRecipient(value, knownAddresses(input.contacts, input.activity))
    if (check.kind === 'lookalike') signals.push({ id: 'lookalike', level: 'risk', similarTo: check.similarTo })
    const dust = input.activity.some((a) => a.direction === 'in' && a.counterparty?.toLowerCase() === lower && typeof a.amount === 'number' && a.amount <= DUST_AMOUNT)
    if (dust) signals.push({ id: 'dust-sender', level: 'risk' })
    signals.push({ id: 'first-time', level: 'warn' })
    if (input.amount !== undefined && input.balance !== undefined && input.balance > 0 && input.amount >= input.balance * 0.5) signals.push({ id: 'most-of-balance', level: 'warn' })
  }
  if (input.usdValue !== undefined && input.largeUsd !== undefined && input.usdValue >= input.largeUsd) signals.push({ id: 'large', level: 'warn' })
  const level: SafetyLevel = signals.some((s) => s.level === 'risk') ? 'risk' : signals.some((s) => s.level === 'warn') ? 'warn' : 'ok'
  return { level, signals }
}
