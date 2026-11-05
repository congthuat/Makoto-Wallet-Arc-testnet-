import { useEffect, useState } from 'react'
import { readCredits, type CreditState } from './credits'
import { useWallet } from './store'

/**
 * One credit state for the whole app.
 *
 * The Agent page, the header pill and the sidebar all read the same value, so adding
 * credits in one place updates every other place immediately — no stale numbers.
 */
let cache: CreditState | undefined
let loadedKey = ''
let loadedAt = 0
let inflight: { key: string; promise: Promise<void> } | null = null
const listeners = new Set<(next: CreditState) => void>()

export function publishCredits(next: CreditState) {
  cache = next
  for (const listener of listeners) listener(next)
}

function load(key: string) {
  if (inflight && inflight.key === key) return inflight.promise
  if (loadedKey === key && Date.now() - loadedAt < 10_000 && cache) return Promise.resolve()
  const promise = readCredits()
    .then((next) => { publishCredits(next); loadedKey = key; loadedAt = Date.now() })
    .finally(() => { if (inflight?.promise === promise) inflight = null })
  inflight = { key, promise }
  return promise
}

export function useCredits(): [CreditState | undefined, (next: CreditState) => void] {
  const { address, taskAuthenticated } = useWallet()
  const [state, setState] = useState<CreditState | undefined>(cache)
  const key = `${address ?? ''}:${taskAuthenticated ? 1 : 0}`

  useEffect(() => {
    listeners.add(setState)
    return () => { listeners.delete(setState) }
  }, [])

  useEffect(() => {
    void load(key)
  }, [key])

  return [state, publishCredits]
}

/** Force a fresh read (after a spend, a top-up or a 402 from the Agent). */
export function refreshCredits() {
  void readCredits().then((next) => {
    loadedAt = Date.now()
    publishCredits(next)
  })
}
