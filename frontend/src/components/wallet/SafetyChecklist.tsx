import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { shortAddress, type SafetyLevel, type SafetySignal } from '../../lib/addressSafety'

const L = (vi: boolean, en: string, viText: string) => (vi ? viText : en)

function text(signal: SafetySignal, vi: boolean): string {
  switch (signal.id) {
    case 'contact': return L(vi, `Saved contact: ${signal.label}`, `Có trong danh bạ: ${signal.label}`)
    case 'sent-before': return L(vi, 'You have sent to this address before.', 'Bạn đã từng gửi tới địa chỉ này.')
    case 'lookalike': {
      const who = signal.similarTo ? (signal.similarTo.label ? `${signal.similarTo.label} (${shortAddress(signal.similarTo.address)})` : shortAddress(signal.similarTo.address)) : ''
      return L(vi, `Looks like ${who} but differs in the middle — a common scam (address poisoning). Paste the address again from a trusted source.`, `Giống ${who} ở đầu và cuối nhưng KHÁC ở giữa — chiêu lừa đảo phổ biến (đầu độc địa chỉ). Hãy dán lại địa chỉ từ nguồn tin cậy.`)
    }
    case 'dust-sender': return L(vi, 'This address sent you a tiny amount before — scammers do this so you copy their address from history.', 'Địa chỉ này từng gửi cho bạn một khoản rất nhỏ — kẻ gian hay làm vậy để bạn sao chép nhầm địa chỉ từ lịch sử.')
    case 'first-time': return L(vi, 'First time sending here. Compare the full address with the person you are paying.', 'Lần đầu gửi tới địa chỉ này. Hãy so khớp toàn bộ địa chỉ với người nhận.')
    case 'most-of-balance': return L(vi, 'This is half or more of your balance, to a new address.', 'Bạn đang gửi từ một nửa số dư trở lên tới một địa chỉ mới.')
    case 'large': return L(vi, 'Large transfer. Transactions on Arc are final and cannot be reversed.', 'Giao dịch lớn. Giao dịch trên Arc là vĩnh viễn, không thể hoàn tác.')
  }
}

/** Pre-send safety checklist. When any risk is found, the confirm button stays locked until `ack`. */
export function SafetyChecklist({ level, signals, ack, onAck, vi, compact = false }: { level: SafetyLevel; signals: readonly SafetySignal[]; ack: boolean; onAck: (value: boolean) => void; vi: boolean; compact?: boolean }) {
  if (signals.length === 0) return null
  const tone = level === 'risk' ? 'border-rose-400/50 bg-rose-500/[0.08]' : level === 'warn' ? 'border-amber-400/25 bg-amber-500/[0.05]' : 'border-neon-500/25 bg-neon-500/[0.04]'
  const Head = level === 'risk' ? ShieldAlert : ShieldCheck
  return (
    <div data-safety-check={level} role={level === 'risk' ? 'alert' : undefined} className={`rounded-2xl border ${tone} ${compact ? 'p-3' : 'p-3.5'} text-[13px] space-y-2`}>
      <div className={`flex items-center gap-2 font-semibold ${level === 'risk' ? 'text-rose-200' : level === 'warn' ? 'text-amber-100' : 'text-neon-200'}`}>
        <Head size={15} /> {level === 'risk' ? L(vi, 'Safety check — possible scam', 'Kiểm tra an toàn — có dấu hiệu lừa đảo') : L(vi, 'Safety check', 'Kiểm tra an toàn')}
      </div>
      <ul className="space-y-1.5">
        {signals.map((signal) => (
          <li key={signal.id} data-safety-signal={signal.id} className={`flex gap-2 ${signal.level === 'risk' ? 'text-rose-100' : signal.level === 'warn' ? 'text-amber-100/90' : 'text-neon-100/90'}`}>
            {signal.level === 'ok' ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-neon-300" /> : <AlertTriangle size={14} className={`mt-0.5 shrink-0 ${signal.level === 'risk' ? 'text-rose-300' : 'text-amber-300'}`} />}
            <span className="min-w-0 break-words">{text(signal, vi)}</span>
          </li>
        ))}
      </ul>
      {level === 'risk' && (
        <label className="flex items-start gap-2.5 pt-1 cursor-pointer font-medium text-rose-50">
          <input data-safety-ack type="checkbox" checked={ack} onChange={(e) => onAck(e.target.checked)} className="mt-0.5 accent-rose-500 w-4 h-4" />
          {L(vi, 'I have checked the full address carefully and still want to send.', 'Tôi đã kiểm tra kỹ toàn bộ địa chỉ và vẫn muốn gửi.')}
        </label>
      )}
    </div>
  )
}
