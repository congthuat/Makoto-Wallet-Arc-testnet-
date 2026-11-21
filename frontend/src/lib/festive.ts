import { useEffect } from 'react'
import { useWallet } from './store'

export type FestiveMode = 'auto' | 'on' | 'off'

/** Christmas season for the automatic theme: 20 Nov → 31 Dec (local time). */
export function isFestiveSeason(now = new Date()): boolean {
  const m = now.getMonth()
  const d = now.getDate()
  return (m === 10 && d >= 20) || m === 11
}

export function festiveActive(mode: FestiveMode | undefined, now = new Date()): boolean {
  if (mode === 'on') return true
  if (mode === 'off') return false
  return isFestiveSeason(now)
}

export function useFestive(): boolean {
  const { settings } = useWallet()
  return festiveActive(settings.festive)
}

/** Mirrors the festive state onto <html data-festive> so CSS (and portals) can react. */
export function useFestiveAttribute(on: boolean) {
  useEffect(() => {
    const root = document.documentElement
    if (on) root.dataset.festive = 'on'
    else delete root.dataset.festive
    return () => { delete root.dataset.festive }
  }, [on])
}
