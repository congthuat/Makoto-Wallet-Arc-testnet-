import { useT } from '../lib/i18n.ts'
import { T } from './wallet/ui.tsx'
import type { SwapVenueChoice } from '../migrated/uniswap.ts'

/** Swap venue choice: best live price, XyloNet or Uniswap v4. Choosing never signs anything. */
export function VenuePicker({ value, onChange, disabled }: { value: SwapVenueChoice; onChange: (v: SwapVenueChoice) => void; disabled?: boolean }) {
  const [, lang] = useT()
  const vi = lang === 'vi'
  const options: { id: SwapVenueChoice; label: string }[] = [
    { id: 'best', label: vi ? 'Giá tốt nhất' : 'Best price' },
    { id: 'xylonet', label: 'XyloNet' },
    { id: 'uniswap', label: 'Uniswap' },
    { id: 'curve', label: 'Curve' },
    { id: 'arcswap', label: 'Arc Swap' },
  ]
  return <div className="flex items-center gap-2 text-[12px] flex-wrap">
    <span className={T.mute}>{vi ? 'Sàn' : 'Venue'}:</span>
    {options.map((o) => <button key={o.id} type="button" disabled={disabled} aria-pressed={value === o.id} onClick={() => onChange(o.id)}
      className={`px-2.5 py-1 rounded-lg border text-[11.5px] font-semibold transition disabled:opacity-50 ${value === o.id ? 'border-neon-400 bg-neon-500/10 text-neon-300' : `border-white/[0.08] ${T.mute} hover:text-white`}`}>{o.label}</button>)}
  </div>
}

/** Venue named in a chat message ("qua Uniswap", "via xylonet"); otherwise best price. */
export function venueFromText(text: string): SwapVenueChoice {
  const t = text.toLowerCase()
  if (/arc\s?swap/.test(t)) return 'arcswap'
  if (/uni\s?swap|\buni\b/.test(t)) return 'uniswap'
  if (/curve/.test(t)) return 'curve'
  if (/xylo/.test(t)) return 'xylonet'
  return 'best'
}
