import { useMemo } from 'react'
import { useFestive, useFestiveAttribute } from '../../lib/festive'

const FLAKES = 38
const BULBS = ['#ef4444', '#D4FF3A', '#facc15', '#38bdf8', '#f472b6']

/** Gentle snowfall + a string of twinkling lights along the top edge. Purely decorative. */
export function FestiveLayer() {
  const on = useFestive()
  useFestiveAttribute(on)
  const flakes = useMemo(() => Array.from({ length: FLAKES }, (_, i) => {
    const size = 2 + ((i * 37) % 5)
    return {
      left: `${(i * 97) % 100}%`,
      size,
      delay: `${-((i * 1.7) % 14)}s`,
      duration: `${10 + ((i * 13) % 12)}s`,
      drift: `${((i * 29) % 60) - 30}px`,
      opacity: 0.35 + ((i * 7) % 5) / 10,
    }
  }), [])
  if (!on) return null
  return (
    <div className="mk-festive pointer-events-none fixed inset-0 z-[35] overflow-hidden" aria-hidden>
      <div className="mk-lights">
        <svg className="absolute inset-x-0 top-0 w-full h-6" preserveAspectRatio="none" viewBox="0 0 100 10"><path d="M0 1 Q 5 7 10 1 T 20 1 T 30 1 T 40 1 T 50 1 T 60 1 T 70 1 T 80 1 T 90 1 T 100 1" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth=".35" vectorEffect="non-scaling-stroke" /></svg>
        {Array.from({ length: 20 }, (_, i) => (
          <i key={i} style={{ left: `${2.5 + i * 5}%`, background: BULBS[i % BULBS.length], color: BULBS[i % BULBS.length], animationDelay: `${(i % 5) * 0.35}s` }} />
        ))}
      </div>
      {flakes.map((f, i) => (
        <span key={i} className="mk-flake" style={{ left: f.left, width: f.size, height: f.size, opacity: f.opacity, animationDelay: f.delay, animationDuration: f.duration, ['--drift' as string]: f.drift }} />
      ))}
    </div>
  )
}
