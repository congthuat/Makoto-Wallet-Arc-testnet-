import { useLayoutEffect, useState } from 'react'
import { ArrowLeftRight, Gift, Rainbow, ReceiptText, Users } from 'lucide-react'
import { useWallet, type Page } from '../lib/store'
import { useT } from '../lib/i18n'
import { T } from './wallet/ui'

export type Hub = { id: string; label: string; icon: any; tabs: { id: Page; icon: any; label: string; desc: string }[] }

/** Related features grouped under one menu entry, switched with a tab strip. */
export const HUBS: Hub[] = [
  {
    id: 'payments', label: 'Payment tools', icon: ReceiptText,
    tabs: [
      { id: 'pay', icon: ReceiptText, label: 'Payment requests', desc: 'Ask anyone to pay you' },
      { id: 'split', icon: Users, label: 'Split a bill', desc: 'Collect or pay a group' },
      { id: 'gifts', icon: Gift, label: 'Gift links', desc: 'Send money as a link' },
    ],
  },
  {
    id: 'exchange', label: 'Swap & Bridge', icon: ArrowLeftRight,
    tabs: [
      { id: 'swap', icon: ArrowLeftRight, label: 'Swap', desc: 'Trade USDC ⇄ EURC' },
      { id: 'bridge', icon: Rainbow, label: 'Bridge', desc: 'Move USDC across chains' },
    ],
  },
]

export const hubOf = (page: Page) => HUBS.find((h) => h.tabs.some((t) => t.id === page))

// Remember the last tab per hub so the highlight slides from it on the next page.
const lastIndex: Record<string, number> = {}

export function HubTabs({ hub }: { hub: Hub }) {
  const [tr] = useT()
  const { page, go } = useWallet()
  const index = Math.max(0, hub.tabs.findIndex((t) => t.id === page))
  const [shown, setShown] = useState(lastIndex[hub.id] ?? index)
  useLayoutEffect(() => {
    lastIndex[hub.id] = index
    const id = requestAnimationFrame(() => setShown(index))
    return () => cancelAnimationFrame(id)
  }, [hub.id, index])
  const n = hub.tabs.length
  const Icon = hub.icon

  return (
    <div className="mb-6">
      <div className={`flex items-center gap-2 mb-2 text-[12px] font-semibold tracking-[0.12em] uppercase ${T.mute}`}>
        <Icon size={13} className="text-neon-300" />{tr(hub.label)}
      </div>
      <div role="tablist" className="relative grid p-1 rounded-2xl bg-white/[0.03] border border-white/[0.07] max-w-[760px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        <span
          aria-hidden
          className="absolute top-1 bottom-1 left-1 rounded-xl bg-neon-500/[0.13] border border-neon-400/40 shadow-[0_0_24px_-8px_rgba(212,255,58,.6)] transition-transform duration-500"
          style={{ width: `calc((100% - 8px) / ${n})`, transform: `translateX(${shown * 100}%)`, transitionTimingFunction: 'cubic-bezier(.34,1.4,.64,1)' }}
        />
        {hub.tabs.map((t, i) => {
          const on = i === index
          const TabIcon = t.icon
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => { if (!on) go(t.id) }}
              className={`group relative z-[1] flex items-center justify-center sm:justify-start gap-2.5 px-2 sm:px-3 py-2 sm:py-2.5 rounded-xl text-left transition-colors ${on ? 'text-white' : `${T.sub} hover:text-white`}`}
            >
              <span className={`hidden sm:flex w-8 h-8 shrink-0 rounded-lg items-center justify-center transition-all duration-300 ${on ? 'bg-neon-500 text-[#0b0b10] scale-105' : 'bg-white/[0.05] group-hover:bg-white/[0.09] group-hover:scale-105'}`}>
                <TabIcon size={15} />
              </span>
              <TabIcon size={15} className={`sm:hidden ${on ? 'text-neon-300' : ''}`} />
              <span className="min-w-0">
                <span className="block text-[12.5px] sm:text-[13.5px] font-semibold truncate">{tr(t.label)}</span>
                <span className={`hidden md:block text-[11.5px] truncate ${T.mute}`}>{tr(t.desc)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
