import { useMemo } from 'react'
import type { GiftTheme } from '../../lib/giftThemes'

const COLORS = ['#facc15', '#ef4444', '#22c55e', '#38bdf8', '#f472b6', '#ffffff', '#D4FF3A']

/** A wrapped present: wobbles while waiting, shakes while opening, pops its lid when opened. */
export function GiftBox({ theme, state, size = 112 }: { theme: GiftTheme; state: 'idle' | 'shaking' | 'open'; size?: number }) {
  const box = theme.box ?? { body: 'linear-gradient(160deg,#ef4444,#991b1b)', lid: 'linear-gradient(160deg,#f87171,#b91c1c)', ribbon: '#facc15' }
  const pieces = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    color: COLORS[i % COLORS.length],
    x: Math.round(Math.cos((i / 28) * Math.PI * 2) * (60 + (i % 4) * 18)),
    y: Math.round(Math.sin((i / 28) * Math.PI * 2) * (50 + (i % 3) * 16)) - 40,
    r: (i * 47) % 360,
    delay: (i % 6) * 0.03,
    w: 5 + (i % 3) * 2,
  })), [])
  const s = size / 112
  return (
    <div className={`mk-giftbox relative mx-auto ${state === 'idle' ? 'is-idle' : state === 'shaking' ? 'is-shaking' : 'is-open'}`} style={{ width: size, height: size * 1.05 }} aria-hidden>
      <div className="mk-giftbox-glow absolute inset-0 rounded-full" style={{ background: `radial-gradient(closest-side, ${theme.glow}, transparent)` }} />
      {state === 'open' && pieces.map((p, i) => (
        <span key={i} className="mk-gift-confetti absolute left-1/2 top-1/2" style={{ width: p.w * s, height: p.w * 1.6 * s, background: p.color, ['--x' as string]: `${p.x * s}px`, ['--y' as string]: `${p.y * s}px`, ['--r' as string]: `${p.r}deg`, animationDelay: `${p.delay}s` }} />
      ))}
      <div className="mk-giftbox-body absolute left-1/2 -translate-x-1/2 rounded-b-xl rounded-t-sm overflow-hidden shadow-[0_14px_30px_-12px_rgba(0,0,0,.7)]" style={{ width: 88 * s, height: 66 * s, bottom: 4 * s, background: box.body }}>
        <span className="absolute inset-y-0 left-1/2 -translate-x-1/2" style={{ width: 14 * s, background: box.ribbon }} />
        <span className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
      </div>
      <div className="mk-giftbox-lid absolute left-1/2" style={{ width: 100 * s, height: 22 * s, bottom: 66 * s, marginLeft: -50 * s }}>
        <div className="absolute inset-0 rounded-md shadow-lg" style={{ background: box.lid }}>
          <span className="absolute inset-y-0 left-1/2 -translate-x-1/2" style={{ width: 14 * s, background: box.ribbon }} />
        </div>
        <span className="absolute rounded-[50%_50%_10%_50%]" style={{ width: 26 * s, height: 20 * s, left: `calc(50% - ${27 * s}px)`, top: -16 * s, border: `${5 * s}px solid ${box.ribbon}`, transform: 'rotate(-20deg)' }} />
        <span className="absolute rounded-[50%_50%_50%_10%]" style={{ width: 26 * s, height: 20 * s, left: `calc(50% + ${1 * s}px)`, top: -16 * s, border: `${5 * s}px solid ${box.ribbon}`, transform: 'rotate(20deg)' }} />
        <span className="absolute rounded-full left-1/2 -translate-x-1/2" style={{ width: 12 * s, height: 12 * s, top: -8 * s, background: box.ribbon }} />
      </div>
    </div>
  )
}
