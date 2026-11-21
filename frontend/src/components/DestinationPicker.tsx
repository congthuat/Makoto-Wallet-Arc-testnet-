import { CCTP_DESTINATIONS } from '../migrated/cctp.ts'

/** Destination chain for the Arc → X Circle CCTP v2 bridge (forwarding routes only). */
export function DestinationPicker({ value, onChange, label, disabled, className = '' }: { value: number; onChange: (chainId: number) => void; label: string; disabled?: boolean; className?: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`rounded-xl bg-black/40 border border-white/[0.1] px-2.5 py-1.5 text-[13px] font-semibold outline-none focus:border-neon-400/60 disabled:opacity-60 ${className}`}
    >
      {CCTP_DESTINATIONS.map((d) => <option key={d.chainId} value={d.chainId} className="bg-[#111]">{d.name}</option>)}
    </select>
  )
}
