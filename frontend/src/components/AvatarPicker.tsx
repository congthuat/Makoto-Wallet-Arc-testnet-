import { useRef, useState } from 'react'
import { Check, Dices, ImagePlus, Loader2, X } from 'lucide-react'
import { useT } from '../lib/i18n'
import { AVATAR_CATEGORIES, AVATAR_TONES, isPhoto, photoFromFile, randomAvatar } from '../lib/contactAvatars'
import { Avatar, Button, Modal, T } from './wallet/ui'

export type AvatarChoice = { emoji?: string; tone?: number; photo?: string }

/** Inline avatar grid: category tabs, emoji grid, colour tones, shuffle. */
export function AvatarGrid({ value, onChange, seed }: { value: AvatarChoice; onChange: (v: AvatarChoice) => void; seed: string }) {
  const [tr] = useT()
  const initial = Math.max(0, AVATAR_CATEGORIES.findIndex((c) => value.emoji && c.items.includes(value.emoji)))
  const [cat, setCat] = useState(initial)
  const items = AVATAR_CATEGORIES[cat].items
  const hasPhoto = isPhoto(value.photo)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  const pickFile = async (file?: File) => {
    if (!file) return
    setBusy(true); setPhotoError(null)
    try {
      const photo = await photoFromFile(file)
      onChange({ ...value, photo })
    } catch (e) {
      const code = e instanceof Error ? e.message : ''
      setPhotoError(tr(code === 'TOO_BIG' ? 'That image is too large (max 20 MB).' : code === 'NOT_IMAGE' ? 'Please choose an image file.' : 'Could not read that image. Try a JPG or PNG.'))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
      <div className={`mk-photo-drop relative flex items-center gap-3 p-3 rounded-2xl border border-dashed transition ${hasPhoto ? 'border-neon-400/50 bg-neon-500/[0.07]' : 'border-white/[0.14] bg-white/[0.02] hover:border-neon-400/40 hover:bg-neon-500/[0.05]'}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]) }}>
        {hasPhoto ? (
          <img key={value.photo} src={value.photo} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-neon-400/60 mk-pop" />
        ) : (
          <span className="w-12 h-12 rounded-full bg-white/[0.05] flex items-center justify-center text-neon-300 shrink-0">
            {busy ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold">{tr(hasPhoto ? 'Your photo is set' : 'Upload a photo')}</div>
          <div className={`text-[12px] ${T.mute}`}>{tr('From your computer, or your phone camera and gallery. Stays on this device only.')}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="h-8 px-3 rounded-lg text-[12px] font-semibold bg-neon-500 text-[#0b0b10] hover:bg-neon-400 active:scale-95 transition disabled:opacity-50">
            {tr(hasPhoto ? 'Change' : 'Choose photo')}
          </button>
          {hasPhoto && (
            <button type="button" onClick={() => onChange({ ...value, photo: undefined })} className={`h-8 w-8 inline-flex items-center justify-center rounded-lg bg-white/[0.06] hover:bg-rose-500/15 hover:text-rose-300 transition ${T.sub}`} aria-label={tr('Remove photo')} title={tr('Remove photo')}><X size={14} /></button>
          )}
        </div>
      </div>
      {photoError && <p className="text-[12px] text-rose-400 -mt-1">{photoError}</p>}
      <div className={`flex items-center gap-3 text-[11px] font-semibold tracking-[0.12em] uppercase ${T.mute}`}><span className="h-px flex-1 bg-white/[0.07]" />{tr('or pick an icon')}<span className="h-px flex-1 bg-white/[0.07]" /></div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar" role="tablist">
        {AVATAR_CATEGORIES.map((c, i) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={i === cat}
            onClick={() => setCat(i)}
            className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-semibold border transition ${i === cat ? 'bg-neon-500/15 border-neon-400/50 text-neon-300' : `bg-white/[0.03] border-white/[0.08] ${T.sub} hover:bg-white/[0.07]`}`}
          >
            <span className="text-[14px] leading-none">{c.icon}</span>{tr(c.label)}
          </button>
        ))}
      </div>

      <div key={cat} className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 p-2 rounded-2xl bg-black/25 border border-white/[0.06] max-h-[216px] overflow-y-auto">
        <button
          type="button"
          onClick={() => onChange({ emoji: undefined, tone: value.tone, photo: undefined })}
          title={tr('Auto colour')}
          aria-label={tr('Auto colour')}
          className={`mk-av-cell relative aspect-square rounded-xl flex items-center justify-center ${!value.emoji && !hasPhoto ? 'is-on' : ''}`}
          style={{ animationDelay: '0ms' }}
        >
          <Avatar size={26} seed={seed || 'makoto'} />
        </button>
        {items.map((e, i) => {
          const on = !hasPhoto && value.emoji === e
          return (
            <button
              key={e}
              type="button"
              onClick={() => onChange({ emoji: e, tone: value.tone, photo: undefined })}
              aria-label={e}
              aria-pressed={on}
              className={`mk-av-cell relative aspect-square rounded-xl flex items-center justify-center text-[24px] leading-none ${on ? 'is-on' : ''}`}
              style={{ animationDelay: `${Math.min(i, 30) * 12}ms` }}
            >
              {e}
              {on && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-neon-500 text-[#0b0b10] flex items-center justify-center mk-pop"><Check size={10} strokeWidth={3} /></span>}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[12px] font-medium mr-1 ${T.mute}`}>{tr('Background')}</span>
        {AVATAR_TONES.map((t, i) => {
          const on = (value.tone ?? 0) === i
          return (
            <button
              key={t.name}
              type="button"
              onClick={() => onChange({ ...value, tone: i })}
              title={tr(t.name)}
              aria-label={tr(t.name)}
              aria-pressed={on}
              className={`w-7 h-7 rounded-full transition-transform duration-300 hover:scale-110 ${on ? 'scale-110' : ''}`}
              style={{ background: t.bg, boxShadow: on ? `0 0 0 2px #121219, 0 0 0 4px ${t.ring.slice(0, 7)}` : `0 0 0 1.5px ${t.ring}` }}
            />
          )
        })}
        <button
          type="button"
          onClick={() => { const r = randomAvatar(); setCat(Math.max(0, AVATAR_CATEGORIES.findIndex((c) => c.items.includes(r.emoji)))); onChange({ ...r, photo: undefined }) }}
          className={`ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-semibold bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.1] transition group ${T.sub}`}
        >
          <Dices size={14} className="transition-transform duration-500 group-hover:rotate-[200deg]" />{tr('Surprise me')}
        </button>
      </div>
    </div>
  )
}

/** Modal wrapper: big live preview + grid, saves on confirm. */
export function AvatarPickerModal({ open, onClose, name, seed, value, onSave }: {
  open: boolean; onClose: () => void; name: string; seed: string; value: AvatarChoice; onSave: (v: AvatarChoice) => void
}) {
  const [tr] = useT()
  const [draft, setDraft] = useState<AvatarChoice>(value)
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) { setLastOpen(open); if (open) setDraft(value) }

  return (
    <Modal open={open} onClose={onClose} title={tr('Choose avatar')} width={520}>
      <div className="flex items-center gap-4 mb-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-neon-400/20 blur-xl mk-breathe" aria-hidden />
          <div key={`${draft.emoji}-${draft.tone}-${draft.photo?.length ?? 0}`} className="relative mk-pop"><Avatar size={68} seed={seed} emoji={draft.emoji} tone={draft.tone} photo={draft.photo} /></div>
        </div>
        <div className="min-w-0">
          <div className="text-[16px] font-semibold truncate">{name || tr('New contact')}</div>
          <div className={`text-[12.5px] ${T.mute}`}>{tr('Upload a photo or pick an icon so this person is easy to spot.')}</div>
        </div>
      </div>
      <AvatarGrid value={draft} onChange={setDraft} seed={seed} />
      <div className="grid grid-cols-2 gap-2 mt-5">
        <Button onClick={onClose}>{tr('Cancel')}</Button>
        <Button variant="primary" onClick={() => { onSave(draft); onClose() }}><Check size={15} />{tr('Use this avatar')}</Button>
      </div>
    </Modal>
  )
}
