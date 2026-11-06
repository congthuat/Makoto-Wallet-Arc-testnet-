import { useEffect, useRef, useState } from 'react'
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

/**
 * True for a moment right after the balance goes up, so the badge can pop.
 * Used by the header pill and the sidebar card.
 */
export function useCreditBump(balance: number) {
  const [bump, setBump] = useState(false)
  const previous = useRef<number | null>(null)
  useEffect(() => {
    const before = previous.current
    previous.current = balance
    if (before === null || balance <= before) return
    setBump(true)
    const timer = window.setTimeout(() => setBump(false), 1_800)
    return () => window.clearTimeout(timer)
  }, [balance])
  return bump
}

/* The top-up panel is global: any surface (the Agent page, the sidebar, the floating
   chat) can open the same panel, and it already knows the credits here. */
let panelOpen = false
const panelListeners = new Set<(open: boolean) => void>()

export function showCreditsPanel() {
  panelOpen = true
  for (const listener of panelListeners) listener(true)
}

export function hideCreditsPanel() {
  panelOpen = false
  for (const listener of panelListeners) listener(false)
}

export function useCreditsPanel() {
  const [open, setOpen] = useState(panelOpen)
  useEffect(() => {
    panelListeners.add(setOpen)
    return () => { panelListeners.delete(setOpen) }
  }, [])
  return { open, show: showCreditsPanel, hide: hideCreditsPanel }
}

/** Force a fresh read (after a spend, a top-up or a 402 from the Agent). */
export function refreshCredits() {
  void readCredits().then((next) => {
    loadedAt = Date.now()
    publishCredits(next)
  })
}
