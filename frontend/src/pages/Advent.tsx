import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Lock, Star } from 'lucide-react'
import { useWallet } from '../lib/store'
import { useT } from '../lib/i18n'
import { CHALLENGES, DOORS, LAYOUT, doorDate, isUnlocked, loadAdvent, saveAdvent, wrappedSeen, type AdventState, type Door } from '../lib/advent'
import { myGifts } from '../lib/gifts'
import { myRequestIds } from '../lib/payRequests'
import { loadGroups } from '../lib/santa'
import { Button, Card, Modal, T } from '../components/wallet/ui'

const L = (vi: boolean, en: string, viText: string) => (vi ? viText : en)
const PANEL = [
  'linear-gradient(150deg, #b91c1c, #7f1d1d)',
  'linear-gradient(150deg, #15803d, #14532d)',
  'linear-gradient(150deg, #a16207, #713f12)',
  'linear-gradient(150deg, #1e3a8a, #172554)',
]

function useChallengeCheck() {
  const { live, address, activity, contacts } = useWallet()
  return useCallback((door: Door, year: number): boolean => {
    if (door.challenge === 'none') return true
    const since = doorDate(year, door.day).getTime()
    const ok = (t: { status: string }) => t.status !== 'failed' && t.status !== 'user_rejected'
    const txs = live ? (activity ?? []).filter((t) => t.timestamp >= since && ok(t)) : []
    switch (door.challenge) {
      case 'send': return txs.some((t) => t.direction === 'out' && (t.kind ?? 'send') === 'send')
      case 'receive': return txs.some((t) => t.direction === 'in')
      case 'note': return txs.some((t) => t.direction === 'out' && !!(t as { note?: string }).note)
      case 'swap': return txs.some((t) => t.kind === 'swap')
      case 'bridge': return txs.some((t) => t.kind === 'bridge')
      case 'contact': return contacts.length >= 1
      case 'contact3': return contacts.length >= 3
      case 'avatar': return contacts.some((c) => !!c.photo || !!c.emoji)
      case 'gift': return live && myGifts(address).length > 0
      case 'santa': return loadGroups().length > 0
      case 'payreq': return live && myRequestIds(address).length > 0
      case 'wrapped': return wrappedSeen()
    }
  }, [live, address, activity, contacts])
}

export default function AdventPage() {
  const [, lang] = useT()
  const vi = lang === 'vi'
  const now = new Date()
  const year = now.getFullYear()
  const [state, setStateRaw] = useState<AdventState>(() => loadAdvent(year))
  const [openDoor, setOpenDoor] = useState<{ door: Door; preview: boolean } | null>(null)
  const check = useChallengeCheck()
  const setState = (s: AdventState) => { setStateRaw(s); saveAdvent(s) }

  // Lock in stars for opened doors whose challenge is now complete.
  useEffect(() => {
    const newly = DOORS.filter((d) => d.challenge !== 'none' && state.opened.includes(d.day) && !state.done.includes(d.day) && check(d, year)).map((d) => d.day)
    if (newly.length) setState({ ...state, done: [...state.done, ...newly] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check, state.opened.join(','), year])

  const started = isUnlocked(year, 1, now)
  const daysToStart = Math.ceil((doorDate(year, 1).getTime() - now.getTime()) / 86_400_000)
  const daysToXmas = Math.ceil((new Date(year, 11, 25).getTime() - now.getTime()) / 86_400_000)
  const challengeDoors = DOORS.filter((d) => d.challenge !== 'none').length
  const stars = state.done.filter((d) => DOORS.find((x) => x.day === d)?.challenge !== 'none').length
  const today = now.getMonth() === 11 ? now.getDate() : 0

  const open = (door: Door) => {
    if (!isUnlocked(year, door.day, now)) return
    if (!state.opened.includes(door.day)) setState({ ...state, opened: [...state.opened, door.day] })
    setOpenDoor({ door, preview: false })
  }

  const flakes = useMemo(() => Array.from({ length: 18 }, (_, i) => ({ left: (i * 53) % 100, size: 2 + (i % 3), dur: 7 + (i % 5) * 2, delay: -(i * 1.3) })), [])

  return (
    <div className="max-w-[920px] space-y-5">
      <div className="relative overflow-hidden rounded-[24px] border border-emerald-300/20 p-5 sm:p-6 mk-in mk-festive">
        <div className="mk-gift-snow absolute inset-0 pointer-events-none" aria-hidden>
          {flakes.map((f, i) => <span key={i} style={{ left: `${f.left}%`, width: f.size, height: f.size, opacity: 0.6, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` }} />)}
        </div>
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="text-[52px] leading-none mk-float" aria-hidden>📅</div>
          <div className="flex-1">
            <h1 className="text-[22px] font-bold text-white">{L(vi, 'Advent calendar', 'Lịch Giáng sinh')}</h1>
            <p className="text-[13px] text-white/70 mt-1 max-w-[520px]">{L(vi, 'One door a day from 1 to 24 December. Each hides a sticker, a tip and sometimes a little challenge — finish it to earn a star.', 'Mỗi ngày mở một ô, từ 1 đến 24/12. Mỗi ô có một sticker, một mẹo hay và đôi khi là thử thách nhỏ — hoàn thành để nhận sao.')}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <div className="rounded-2xl bg-black/25 border border-white/10 px-3.5 py-2 text-center"><div className="text-[20px] font-black text-white">{state.opened.length}<span className="text-[12px] text-white/50">/24</span></div><div className="text-[10px] text-white/60">{L(vi, 'stickers', 'sticker')}</div></div>
            <div className="rounded-2xl bg-black/25 border border-white/10 px-3.5 py-2 text-center"><div className="text-[20px] font-black text-amber-300">{stars}<span className="text-[12px] text-white/50">/{challengeDoors}</span></div><div className="text-[10px] text-white/60">{L(vi, 'stars', 'sao')}</div></div>
          </div>
        </div>
        <div className="relative mt-4 text-[13px] text-white/80">
          {!started
            ? <span>⏳ {L(vi, `The first door opens in ${daysToStart} day${daysToStart === 1 ? '' : 's'} (1 December).`, `Ô đầu tiên sẽ mở sau ${daysToStart} ngày nữa (1/12).`)} <button className="underline text-neon-300 ml-1" onClick={() => setOpenDoor({ door: DOORS[0], preview: true })}>{L(vi, 'Peek at door 1', 'Xem thử ô số 1')}</button></span>
            : daysToXmas > 0 ? <span>🎄 {L(vi, `${daysToXmas} day${daysToXmas === 1 ? '' : 's'} until Christmas`, `Còn ${daysToXmas} ngày nữa là Giáng sinh`)}</span>
              : <span>🌟 {L(vi, 'Merry Christmas! Every door is open.', 'Giáng sinh an lành! Tất cả các ô đã mở.')}</span>}
        </div>
      </div>

      {state.opened.length === 24 && (
        <Card className="p-4 flex items-center gap-3 mk-pop border-amber-300/30">
          <span className="text-[34px]" aria-hidden>🏆</span>
          <div><div className="text-[14px] font-semibold">{L(vi, 'Calendar complete!', 'Hoàn thành lịch Giáng sinh!')}</div><div className={`text-[12px] ${T.mute}`}>{L(vi, `You collected all 24 stickers and ${stars} stars.`, `Bạn đã sưu tầm đủ 24 sticker và ${stars} ngôi sao.`)}</div></div>
        </Card>
      )}

      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5 sm:gap-3">
        {LAYOUT.map((day, i) => {
          const door = DOORS[day - 1]
          const unlocked = isUnlocked(year, day, now)
          const opened = state.opened.includes(day)
          const done = state.done.includes(day) && door.challenge !== 'none'
          const isToday = day === today && !opened
          return (
            <button
              key={day}
              onClick={() => (opened ? setOpenDoor({ door, preview: false }) : open(door))}
              disabled={!unlocked}
              className={`mk-door mk-in relative aspect-square rounded-2xl ${opened ? 'is-open' : ''} ${isToday ? 'is-today' : ''} ${unlocked ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              style={{ animationDelay: `${i * 0.025}s` }}
              aria-label={L(vi, `Door ${day}`, `Ô ${day}`)}
            >
              <div className="absolute inset-0 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex flex-col items-center justify-center">
                <span className="text-[30px] sm:text-[36px] leading-none">{opened ? door.sticker : ''}</span>
                {opened && <span className={`text-[10px] mt-1 ${T.mute}`}>{day}/12</span>}
                {done && <Star size={13} className="absolute top-1.5 right-1.5 text-amber-300 fill-amber-300" />}
              </div>
              <div className={`mk-door-panel absolute inset-0 rounded-2xl border border-white/15 flex flex-col items-center justify-center text-white shadow-lg ${unlocked ? '' : 'opacity-45 saturate-50'}`} style={{ background: PANEL[day % 4], boxShadow: isToday ? '0 0 0 2px rgba(250,204,21,.7), 0 0 26px rgba(250,204,21,.45)' : undefined }}>
                <span className="text-[22px] sm:text-[26px] font-black drop-shadow">{day}</span>
                {!unlocked ? <Lock size={12} className="mt-0.5 text-white/70" /> : isToday ? <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-200">{L(vi, 'today', 'hôm nay')}</span> : null}
                <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-white/15" aria-hidden />
              </div>
            </button>
          )
        })}
      </div>

      {openDoor && <DoorModal door={openDoor.door} preview={openDoor.preview} vi={vi} year={year} done={state.done.includes(openDoor.door.day)} check={check} onClose={() => setOpenDoor(null)} />}
    </div>
  )
}

function DoorModal({ door, preview, vi, year, done, check, onClose }: { door: Door; preview: boolean; vi: boolean; year: number; done: boolean; check: (d: Door, y: number) => boolean; onClose: () => void }) {
  const { go } = useWallet()
  const ch = door.challenge === 'none' ? null : CHALLENGES[door.challenge]
  const complete = done || (!preview && check(door, year))
  const confetti = useMemo(() => Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2
    const r = 70 + (i % 4) * 22
    return { x: Math.cos(a) * r, y: Math.sin(a) * r - 30, rot: (i * 47) % 360, c: ['#ef4444', '#22c55e', '#facc15', '#fff', '#38bdf8'][i % 5] }
  }), [])
  return (
    <Modal open onClose={onClose} title={L(vi, `Door ${door.day} · ${door.day} December`, `Ô số ${door.day} · ngày ${door.day}/12`)}>
      <div className="text-center">
        <div className="relative h-[120px] flex items-center justify-center">
          {confetti.map((p, i) => <span key={i} className="mk-gift-confetti absolute left-1/2 top-1/2 w-2 h-3" style={{ background: p.c, ['--x' as string]: `${p.x}px`, ['--y' as string]: `${p.y}px`, ['--r' as string]: `${p.rot}deg`, animationDelay: `${0.1 + (i % 5) * 0.03}s` }} />)}
          <span className="text-[76px] leading-none mk-pop relative">{door.sticker}</span>
        </div>
        <div className="text-[18px] font-bold mk-in">{vi ? door.title[1] : door.title[0]}</div>
        <p className={`text-[14px] mt-1.5 ${T.sub} mk-in`} style={{ animationDelay: '.1s' }}>{vi ? door.tip[1] : door.tip[0]}</p>
        {preview && <p className="text-[12px] mt-3 text-amber-300">{L(vi, 'Preview — this door really opens on 1 December.', 'Xem thử — ô này sẽ mở thật vào ngày 1/12.')}</p>}
      </div>
      {ch && (
        <div className={`mt-4 rounded-2xl p-3.5 border mk-in ${complete ? 'bg-amber-400/10 border-amber-300/30' : 'bg-white/[0.03] border-white/[0.08]'}`} style={{ animationDelay: '.2s' }}>
          <div className="flex items-center gap-3">
            <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${complete ? 'bg-amber-400 text-[#1a1206]' : 'bg-white/[0.06] text-amber-300'}`}>{complete ? <Check size={17} /> : <Star size={16} />}</span>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[11px] uppercase tracking-wider text-amber-300 font-semibold">{L(vi, 'Challenge', 'Thử thách')}</div>
              <div className="text-[13px] font-medium">{vi ? ch.label[1] : ch.label[0]}</div>
              {complete && <div className="text-[12px] text-amber-200 mt-0.5">⭐ {L(vi, 'Star earned!', 'Đã nhận sao!')}</div>}
            </div>
          </div>
          {!complete && !preview && <Button variant="primary" size="sm" className="w-full mt-3" onClick={() => { onClose(); go(ch.page) }}>{L(vi, 'Do it now', 'Làm ngay')}<ArrowRight size={13} /></Button>}
          {!complete && !preview && ch.since && <p className={`text-[11px] mt-2 ${T.mute}`}>{L(vi, 'Counts from today with a connected wallet. Come back here after — the star appears automatically.', 'Tính từ hôm nay, cần kết nối ví. Làm xong quay lại đây — sao sẽ tự hiện.')}</p>}
        </div>
      )}
    </Modal>
  )
}
