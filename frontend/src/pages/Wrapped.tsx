import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, Pause, Play, RotateCcw, Share2, PartyPopper, Wallet } from 'lucide-react'
import { useWallet } from '../lib/store'
import { useT } from '../lib/i18n'
import { short } from '../lib/wallet'
import { fetchYearTransfers, summarizeYear, type YearStats } from '../lib/wrapped'
import { markWrappedSeen } from '../lib/advent'
import { Avatar, Button, Card, EmptyState, Orb, Skeleton, T } from '../components/wallet/ui'

const L = (vi: boolean, en: string, viText: string) => (vi ? viText : en)
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_VI = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12']
const SLIDE_MS = 6500
const money = (n: number) => n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toLocaleString('en-US', { maximumFractionDigits: 2 })

function useCountUp(target: number, run: boolean, ms = 1200) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!run) { setV(0); return }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(target); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      setV(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, run, ms])
  return v
}

function Big({ value, run, decimals = 0, className = '' }: { value: number; run: boolean; decimals?: number; className?: string }) {
  const v = useCountUp(value, run)
  return <span className={`tabular-nums ${className}`}>{decimals ? v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : Math.round(v).toLocaleString('en-US')}</span>
}

type SlideDef = { key: string; bg: string; render: (active: boolean) => React.ReactNode }

export default function WrappedPage() {
  const [tr, lang] = useT()
  const vi = lang === 'vi'
  const { live, address, contacts, swapRecords, bridgeRecords, sendRecords, go } = useWallet()
  const year = new Date().getFullYear()
  useEffect(() => { markWrappedSeen() }, [])

  const q = useQuery({
    queryKey: ['wrapped', address, year],
    queryFn: ({ signal }) => fetchYearTransfers(address, year, signal),
    enabled: live && !!address,
    staleTime: 10 * 60_000,
    retry: 1,
  })

  const stats = useMemo<YearStats | null>(() => {
    if (!q.data) return null
    const me = address.toLowerCase()
    const inYear = (t: number) => new Date(t).getFullYear() === year
    const mine = <R extends { account?: string; timestamp: number }>(rows: R[] | undefined) => (Array.isArray(rows) ? rows : []).filter((r) => r.account?.toLowerCase() === me && inYear(r.timestamp))
    return summarizeYear(year, q.data, {
      swaps: mine(swapRecords as any).length,
      bridges: mine(bridgeRecords as any).length,
      notes: mine(sendRecords as any).filter((r: any) => !!r.note).length,
    })
  }, [q.data, address, year, swapRecords, bridgeRecords, sendRecords])

  const intro = (
    <div className="max-w-[640px] mx-auto">
      <div className="text-center pt-6 pb-4 mk-in">
        <div className="relative w-fit mx-auto mb-4"><Orb size={64} float /></div>
        <h1 className="text-[26px] font-bold tracking-tight">{L(vi, `Your ${year} on Makoto`, `Năm ${year} của bạn trên Makoto`)}</h1>
        <p className={`text-[14px] mt-1 ${T.sub}`}>{L(vi, 'A look back at your year — from real on-chain activity on Arc.', 'Nhìn lại một năm của bạn — từ giao dịch thật trên chuỗi Arc.')}</p>
      </div>
    </div>
  )

  if (!live) return (
    <div>{intro}<Card><EmptyState icon={Wallet} title={L(vi, 'Connect a wallet to see your year', 'Kết nối ví để xem năm của bạn')} desc={L(vi, 'Your recap is built from your real transactions, so demo mode has nothing to show.', 'Bản tổng kết được tạo từ giao dịch thật của bạn, nên chế độ demo không có gì để hiển thị.')} /></Card></div>
  )
  if (q.isLoading) return (
    <div>{intro}<Card className="p-6 space-y-3"><p className={`text-[13px] text-center ${T.sub}`}>{L(vi, 'Rewinding your year…', 'Đang tua lại năm của bạn…')}</p><Skeleton className="w-full h-40" /></Card></div>
  )
  if (q.isError) return (
    <div>{intro}<Card><EmptyState icon={RotateCcw} title={L(vi, 'Could not load your history', 'Chưa tải được lịch sử')} desc={L(vi, 'The Arc explorer did not answer. Try again in a moment.', 'Trình khám phá Arc chưa phản hồi. Thử lại sau giây lát.')} action={<Button onClick={() => q.refetch()}><RotateCcw size={14} />{tr('Retry')}</Button>} /></Card></div>
  )
  if (!stats || stats.txCount === 0) return (
    <div>{intro}<Card><EmptyState icon={PartyPopper} title={L(vi, `No transactions in ${year} yet`, `Chưa có giao dịch nào trong năm ${year}`)} desc={L(vi, 'Send or receive some USDC and come back — your story starts with the first one.', 'Hãy gửi hoặc nhận chút USDC rồi quay lại — câu chuyện bắt đầu từ giao dịch đầu tiên.')} action={<Button variant="primary" onClick={() => go('send')}>{tr('Send')}</Button>} /></Card></div>
  )
  return <Story stats={stats} vi={vi} address={address} contacts={contacts} />
}

function Story({ stats, vi, address, contacts }: { stats: YearStats; vi: boolean; address: string; contacts: { name: string; address: string; emoji?: string; tone?: number; photo?: string }[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const months = vi ? MONTHS_VI : MONTHS_EN
  const friend = stats.topFriend ? contacts.find((c) => c.address.toLowerCase() === stats.topFriend!.address.toLowerCase()) : undefined
  const friendName = friend?.name ?? (stats.topFriend ? short(stats.topFriend.address) : '')
  const maxMonth = Math.max(1, ...stats.months)
  const fmtDate = (t: number) => new Date(t).toLocaleDateString(vi ? 'vi-VN' : 'en-US', { day: 'numeric', month: 'long' })

  const slides: SlideDef[] = [
    {
      key: 'hello', bg: 'radial-gradient(120% 90% at 20% 0%, rgba(163,230,53,.35), transparent 60%), radial-gradient(90% 80% at 100% 100%, rgba(139,92,246,.45), transparent 60%), #0d0d14',
      render: () => (
        <div className="flex flex-col items-center justify-center h-full text-center gap-5">
          <div className="mk-pop"><Orb size={88} float /></div>
          <div className="mk-in" style={{ animationDelay: '.15s' }}>
            <div className="text-[13px] uppercase tracking-[.25em] text-white/60">Makoto Wrapped</div>
            <div className="text-[44px] font-black leading-none mt-2">{stats.year}</div>
            <p className="text-[16px] text-white/80 mt-3 max-w-[260px] mx-auto">{L(vi, 'What a year. Let’s look back together.', 'Một năm thật đáng nhớ. Cùng nhìn lại nhé.')}</p>
          </div>
          {stats.firstTime && <p className="text-[12px] text-white/50 mk-in" style={{ animationDelay: '.35s' }}>{L(vi, `It all started on ${fmtDate(stats.firstTime)}`, `Mọi thứ bắt đầu từ ngày ${fmtDate(stats.firstTime)}`)}</p>}
        </div>
      ),
    },
    {
      key: 'count', bg: 'radial-gradient(100% 70% at 50% 0%, rgba(56,189,248,.45), transparent 65%), #0b1020',
      render: (a) => (
        <div className="flex flex-col justify-center h-full gap-3">
          <p className="text-[16px] text-white/70 mk-in">{L(vi, 'This year you made', 'Năm nay bạn đã thực hiện')}</p>
          <div className="text-[84px] font-black leading-none text-sky-300"><Big value={stats.txCount} run={a} /></div>
          <p className="text-[20px] font-semibold mk-in" style={{ animationDelay: '.2s' }}>{L(vi, 'transactions on Arc', 'giao dịch trên Arc')}</p>
          <p className="text-[14px] text-white/60 mk-in" style={{ animationDelay: '.4s' }}>{L(vi, `across ${stats.activeDays} different days`, `trong ${stats.activeDays} ngày khác nhau`)}{stats.people ? L(vi, `, with ${stats.people} people`, `, với ${stats.people} người`) : ''}.</p>
        </div>
      ),
    },
    {
      key: 'flow', bg: 'radial-gradient(90% 70% at 0% 0%, rgba(163,230,53,.4), transparent 60%), radial-gradient(90% 70% at 100% 100%, rgba(244,114,182,.35), transparent 60%), #0e0f12',
      render: (a) => (
        <div className="flex flex-col justify-center h-full gap-6">
          <p className="text-[16px] text-white/70 mk-in">{L(vi, 'Money in motion', 'Dòng tiền của bạn')}</p>
          <div className="mk-in" style={{ animationDelay: '.1s' }}>
            <div className="text-[12px] uppercase tracking-widest text-neon-300">{L(vi, `Sent · ${stats.sentCount} times`, `Đã gửi · ${stats.sentCount} lần`)}</div>
            <div className="text-[46px] font-black leading-tight"><Big value={stats.sent.USDC} run={a} decimals={stats.sent.USDC < 100 ? 2 : 0} /> <span className="text-[18px] text-white/60">USDC</span></div>
            {stats.sent.EURC > 0 && <div className="text-[14px] text-white/60">+ {money(stats.sent.EURC)} EURC</div>}
          </div>
          <div className="mk-in" style={{ animationDelay: '.3s' }}>
            <div className="text-[12px] uppercase tracking-widest text-pink-300">{L(vi, `Received · ${stats.receivedCount} times`, `Đã nhận · ${stats.receivedCount} lần`)}</div>
            <div className="text-[46px] font-black leading-tight"><Big value={stats.received.USDC} run={a} decimals={stats.received.USDC < 100 ? 2 : 0} /> <span className="text-[18px] text-white/60">USDC</span></div>
            {stats.received.EURC > 0 && <div className="text-[14px] text-white/60">+ {money(stats.received.EURC)} EURC</div>}
          </div>
        </div>
      ),
    },
    ...(stats.topFriend ? [{
      key: 'friend', bg: 'radial-gradient(100% 80% at 50% 10%, rgba(251,191,36,.4), transparent 60%), #14100a',
      render: () => (
        <div className="flex flex-col items-center justify-center h-full text-center gap-4">
          <p className="text-[16px] text-white/70 mk-in">{L(vi, 'Your number one was', 'Người bạn chuyển nhiều nhất là')}</p>
          <div className="mk-pop rounded-full p-1.5 bg-gradient-to-br from-amber-300 to-pink-400 shadow-[0_0_60px_rgba(251,191,36,.45)]" style={{ animationDelay: '.15s' }}>
            <Avatar size={104} seed={stats.topFriend!.address} emoji={friend?.emoji} tone={friend?.tone} photo={friend?.photo} />
          </div>
          <div className="text-[30px] font-black mk-in" style={{ animationDelay: '.3s' }}>{friendName}</div>
          <p className="text-[15px] text-white/75 mk-in" style={{ animationDelay: '.45s' }}>{L(vi, `${stats.topFriend!.count} payments`, `${stats.topFriend!.count} lần chuyển`)}{stats.topFriend!.total > 0 ? ` · ${money(stats.topFriend!.total)} USDC` : ''}</p>
          {!friend && <p className="text-[12px] text-white/45 mk-in" style={{ animationDelay: '.6s' }}>{L(vi, 'Tip: save them in Contacts to see their name here.', 'Mẹo: lưu vào Danh bạ để thấy tên ở đây.')}</p>}
        </div>
      ),
    }] : []),
    {
      key: 'months', bg: 'radial-gradient(100% 70% at 50% 100%, rgba(139,92,246,.5), transparent 65%), #0d0b18',
      render: (a) => (
        <div className="flex flex-col justify-center h-full gap-5">
          <div className="mk-in">
            <p className="text-[16px] text-white/70">{L(vi, 'Your busiest month', 'Tháng sôi động nhất')}</p>
            <div className="text-[40px] font-black text-violet-300 leading-tight">{new Date(stats.year, stats.busiestMonth, 1).toLocaleDateString(vi ? 'vi-VN' : 'en-US', { month: 'long' })}</div>
            <p className="text-[14px] text-white/60">{L(vi, `${stats.months[stats.busiestMonth]} transactions`, `${stats.months[stats.busiestMonth]} giao dịch`)}</p>
          </div>
          <div className="flex items-end gap-1.5 h-[150px]">
            {stats.months.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <div className={`w-full rounded-t-md ${i === stats.busiestMonth ? 'bg-gradient-to-t from-violet-500 to-fuchsia-300' : 'bg-white/20'}`} style={{ height: a ? `${Math.max(4, (m / maxMonth) * 100)}%` : '4%', transition: `height .9s var(--mk-ease-spring, ease) ${i * 0.05}s` }} />
                <span className="text-[9px] text-white/50">{months[i]}</span>
              </div>
            ))}
          </div>
          {stats.busiestDay && stats.busiestDay.count > 1 && <p className="text-[13px] text-white/60 mk-in" style={{ animationDelay: '.5s' }}>{L(vi, `Busiest day: ${fmtDate(stats.busiestDay.time)} with ${stats.busiestDay.count} transactions.`, `Ngày bận nhất: ${fmtDate(stats.busiestDay.time)} với ${stats.busiestDay.count} giao dịch.`)}</p>}
        </div>
      ),
    },
    ...(stats.biggest || stats.swaps || stats.bridges || stats.notes ? [{
      key: 'moments', bg: 'radial-gradient(100% 70% at 100% 0%, rgba(52,211,153,.4), transparent 60%), #08130f',
      render: () => (
        <div className="flex flex-col justify-center h-full gap-4">
          <p className="text-[16px] text-white/70 mk-in">{L(vi, 'Moments worth remembering', 'Những khoảnh khắc đáng nhớ')}</p>
          {stats.biggest && (
            <div className="rounded-2xl bg-white/[0.07] border border-white/10 p-4 mk-in" style={{ animationDelay: '.1s' }}>
              <div className="text-[12px] text-emerald-300 uppercase tracking-widest">{L(vi, 'Biggest send', 'Lần gửi lớn nhất')}</div>
              <div className="text-[30px] font-black">{money(stats.biggest.amount)} {stats.biggest.symbol}</div>
              <div className="text-[12px] text-white/55">{fmtDate(stats.biggest.time)} · {contacts.find((c) => c.address.toLowerCase() === stats.biggest!.to.toLowerCase())?.name ?? short(stats.biggest.to)}</div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {[[stats.swaps, L(vi, 'swaps', 'lần đổi')], [stats.bridges, L(vi, 'bridges', 'lần bridge')], [stats.notes, L(vi, 'notes', 'lời nhắn')]].map(([n, label], i) => (
              <div key={i} className="rounded-2xl bg-white/[0.07] border border-white/10 p-3 text-center mk-pop" style={{ animationDelay: `${0.25 + i * 0.1}s` }}>
                <div className="text-[26px] font-black">{n}</div>
                <div className="text-[11px] text-white/60">{label}</div>
              </div>
            ))}
          </div>
        </div>
      ),
    }] : []),
    {
      key: 'persona', bg: 'radial-gradient(120% 90% at 50% 0%, rgba(163,230,53,.35), transparent 55%), radial-gradient(100% 80% at 50% 100%, rgba(236,72,153,.35), transparent 60%), #0d0d14',
      render: () => (
        <div className="flex flex-col items-center justify-center h-full text-center gap-3">
          <p className="text-[16px] text-white/70 mk-in">{L(vi, `In ${stats.year} you were…`, `Năm ${stats.year}, bạn là…`)}</p>
          <div className="text-[84px] leading-none mk-pop" style={{ animationDelay: '.2s' }}>{stats.persona.emoji}</div>
          <div className="text-[30px] font-black mk-in" style={{ animationDelay: '.4s' }}>{vi ? stats.persona.titleVi : stats.persona.title}</div>
          <p className="text-[15px] text-white/75 max-w-[280px] mk-in" style={{ animationDelay: '.55s' }}>{vi ? stats.persona.descVi : stats.persona.desc}</p>
        </div>
      ),
    },
    {
      key: 'share', bg: '#0d0d14',
      render: (a) => <ShareSlide stats={stats} vi={vi} address={address} friendName={friendName} active={a} />,
    },
  ]

  const last = slides.length - 1
  const playing = !paused && index < last

  useEffect(() => { setElapsed(0) }, [index])
  useEffect(() => {
    if (!playing) return
    const t0 = performance.now() - elapsed
    let raf = 0
    const tick = (t: number) => {
      const e = t - t0
      if (e >= SLIDE_MS) { setIndex((i) => Math.min(last, i + 1)); return }
      setElapsed(e)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index, last])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(last, i + 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [last])

  const slide = slides[index]
  return (
    <div className="max-w-[440px] mx-auto">
      <div className="relative rounded-[28px] overflow-hidden border border-white/10 shadow-2xl text-white select-none" style={{ background: slide.bg, height: 'min(680px, calc(100dvh - 180px))', minHeight: 520, transition: 'background .6s ease' }}>
        <div className="absolute top-3 inset-x-3 flex gap-1 z-20">
          {slides.map((s, i) => (
            <div key={s.key} className="flex-1 h-[3px] rounded-full bg-white/20 overflow-hidden">
              <div className="h-full bg-white rounded-full" style={{ width: i < index ? '100%' : i > index ? '0%' : index === last ? '100%' : `${(elapsed / SLIDE_MS) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="absolute top-6 inset-x-4 flex items-center justify-between z-20">
          <span className="text-[11px] font-semibold tracking-[.2em] text-white/60">MAKOTO · {stats.year}</span>
          {index < last && <button onClick={() => setPaused((p) => !p)} className="p-1.5 rounded-full bg-black/25 hover:bg-black/40" aria-label={paused ? 'Play' : 'Pause'}>{paused ? <Play size={13} /> : <Pause size={13} />}</button>}
        </div>
        {index < last && <>
          <button className="absolute left-0 top-12 bottom-0 w-1/3 z-10" aria-label="Previous" onClick={() => setIndex((i) => Math.max(0, i - 1))} />
          <button className="absolute right-0 top-12 bottom-0 w-2/3 z-10" aria-label="Next" onClick={() => setIndex((i) => Math.min(last, i + 1))} />
        </>}
        <div key={slide.key} className="absolute inset-0 px-7 pt-14 pb-8 mk-in">{slide.render(true)}</div>
      </div>
      <div className="flex items-center justify-center gap-2 mt-4">
        <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}><ChevronLeft size={14} /></Button>
        <span className={`text-[12px] tabular-nums ${T.mute}`}>{index + 1} / {slides.length}</span>
        <Button size="sm" variant="ghost" disabled={index === last} onClick={() => setIndex((i) => Math.min(last, i + 1))}><ChevronRight size={14} /></Button>
        {index === last && <Button size="sm" onClick={() => { setIndex(0); setPaused(false) }}><RotateCcw size={13} />{L(vi, 'Replay', 'Xem lại')}</Button>}
      </div>
    </div>
  )
}

function drawCard(stats: YearStats, vi: boolean, address: string, friendName: string): HTMLCanvasElement {
  const W = 1080, H = 1350
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#0d0d14'; g.fillRect(0, 0, W, H)
  const glow = (x: number, y: number, r: number, color: string) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, color); rg.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = rg; g.fillRect(0, 0, W, H)
  }
  glow(180, 120, 700, 'rgba(163,230,53,0.38)')
  glow(980, 1250, 800, 'rgba(139,92,246,0.45)')
  glow(1000, 300, 500, 'rgba(236,72,153,0.22)')
  const font = (w: number, s: number) => `${w} ${s}px Inter, system-ui, -apple-system, Segoe UI, sans-serif`
  g.textBaseline = 'alphabetic'
  g.fillStyle = 'rgba(255,255,255,0.65)'; g.font = font(700, 30)
  g.fillText('MAKOTO WRAPPED', 80, 120)
  g.fillStyle = '#fff'; g.font = font(900, 150)
  g.fillText(String(stats.year), 74, 270)
  g.font = font(400, 92); g.fillText(stats.persona.emoji, 80, 420)
  g.font = font(800, 62); g.fillText(vi ? stats.persona.titleVi : stats.persona.title, 200, 405)

  const box = (x: number, y: number, w: number, h: number, label: string, value: string, color: string) => {
    g.fillStyle = 'rgba(255,255,255,0.07)'
    g.beginPath(); g.roundRect(x, y, w, h, 32); g.fill()
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; g.stroke()
    g.fillStyle = color; g.font = font(700, 26); g.fillText(label.toUpperCase(), x + 34, y + 58)
    g.fillStyle = '#fff'; g.font = font(900, 64)
    let s = value
    while (g.measureText(s).width > w - 68 && s.length > 4) s = s.slice(0, -2) + '…'
    g.fillText(s, x + 34, y + 138)
  }
  const colW = (W - 160 - 30) / 2
  box(80, 490, colW, 180, L(vi, 'Transactions', 'Giao dịch'), stats.txCount.toLocaleString('en-US'), '#7dd3fc')
  box(80 + colW + 30, 490, colW, 180, L(vi, 'Active days', 'Ngày hoạt động'), String(stats.activeDays), '#f9a8d4')
  box(80, 700, colW, 180, L(vi, 'Sent', 'Đã gửi'), `${money(stats.sent.USDC)} USDC`, '#bef264')
  box(80 + colW + 30, 700, colW, 180, L(vi, 'Received', 'Đã nhận'), `${money(stats.received.USDC)} USDC`, '#fcd34d')
  if (friendName) box(80, 910, W - 160, 180, L(vi, 'Number one', 'Chuyển nhiều nhất'), friendName, '#c4b5fd')

  const top = friendName ? 1130 : 940
  const maxM = Math.max(1, ...stats.months)
  const bw = (W - 160 - 11 * 12) / 12
  const bh = 120
  stats.months.forEach((m, i) => {
    const h = Math.max(8, (m / maxM) * bh)
    g.fillStyle = i === stats.busiestMonth ? '#c084fc' : 'rgba(255,255,255,0.25)'
    g.beginPath(); g.roundRect(80 + i * (bw + 12), top + bh - h, bw, h, 8); g.fill()
  })
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = font(600, 26)
  g.fillText(`makotowallet.xyz · ${short(address)}`, 80, H - 50)
  g.textAlign = 'right'; g.fillText('Arc Testnet', W - 80, H - 50); g.textAlign = 'left'
  return c
}

function ShareSlide({ stats, vi, address, friendName, active }: { stats: YearStats; vi: boolean; address: string; friendName: string; active: boolean }) {
  const [url, setUrl] = useState('')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { notify } = useWallet()
  useEffect(() => {
    if (!active) return
    try {
      const c = drawCard(stats, vi, address, friendName)
      canvasRef.current = c
      setUrl(c.toDataURL('image/png'))
    } catch { setUrl('') }
  }, [active, stats, vi, address, friendName])

  const fileName = `makoto-wrapped-${stats.year}.png`
  const download = () => {
    if (!url) return
    const a = document.createElement('a')
    a.href = url; a.download = fileName; a.click()
  }
  const share = async () => {
    const c = canvasRef.current
    if (!c) return
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
    const text = L(vi, `My ${stats.year} on Makoto Wallet ✨ makotowallet.xyz`, `Năm ${stats.year} của mình trên Makoto Wallet ✨ makotowallet.xyz`)
    try {
      if (blob && navigator.canShare?.({ files: [new File([blob], fileName, { type: 'image/png' })] })) {
        await navigator.share({ files: [new File([blob], fileName, { type: 'image/png' })], text })
        return
      }
    } catch (e) { if ((e as Error)?.name === 'AbortError') return }
    download()
    notify(L(vi, 'Image saved — share it anywhere', 'Đã lưu ảnh — chia sẻ ở đâu cũng được'))
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 relative z-20">
      <p className="text-[15px] text-white/75">{L(vi, 'Your year, in one card', 'Cả năm của bạn, gói trong một tấm thẻ')}</p>
      {url ? <img src={url} alt="Makoto Wrapped" className="w-full max-w-[300px] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,.55)] border border-white/10 mk-pop" /> : <Skeleton className="w-[300px] h-[375px] rounded-2xl" />}
      <div className="flex gap-2">
        <Button variant="primary" onClick={share} disabled={!url}><Share2 size={14} />{L(vi, 'Share', 'Chia sẻ')}</Button>
        <Button onClick={download} disabled={!url}><Download size={14} />{L(vi, 'Download', 'Tải về')}</Button>
      </div>
    </div>
  )
}
