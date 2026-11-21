import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Check, Copy, Dices, Eye, EyeOff, Gift, Plus, RefreshCw, Share2, Trash2, UserPlus, X } from 'lucide-react'
import { useWallet } from '../lib/store'
import { useT } from '../lib/i18n'
import { isAddress, short } from '../lib/wallet'
import { drawPairs, loadGroups, loadTickets, parseTicketHash, rememberTicket, saveGroups, ticketFor, ticketLink, type SantaGroup, type SantaMember, type SantaTicket } from '../lib/santa'
import { fetchYearTransfers } from '../lib/wrapped'
import { Avatar, Button, Card, EmptyState, Field, Modal, T, inputCls } from '../components/wallet/ui'
import { copyText } from '../components/wallet/shared'

const L = (vi: boolean, en: string, viText: string) => (vi ? viText : en)
const fmtDay = (d: string, vi: boolean) => { const t = Date.parse(`${d}T12:00:00`); return Number.isFinite(t) ? new Date(t).toLocaleDateString(vi ? 'vi-VN' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : d }
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export default function SantaPage() {
  const [, lang] = useT()
  const vi = lang === 'vi'
  const [groups, setGroupsState] = useState<SantaGroup[]>(() => loadGroups())
  const [tickets, setTickets] = useState<SantaTicket[]>(() => loadTickets())
  const [incoming, setIncoming] = useState<SantaTicket | null>(() => typeof window === 'undefined' ? null : parseTicketHash(window.location.hash))
  const [editing, setEditing] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const setGroups = (next: SantaGroup[]) => { setGroupsState(next); saveGroups(next) }

  useEffect(() => {
    const onHash = () => { const t = parseTicketHash(window.location.hash); if (t) setIncoming(t) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    if (!incoming) return
    rememberTicket(incoming)
    setTickets(loadTickets())
  }, [incoming])

  const open = groups.find((g) => g.id === openId) ?? null

  return (
    <div className="max-w-[880px] space-y-5">
      <div className="relative overflow-hidden rounded-[24px] border border-rose-300/20 p-5 sm:p-6 mk-in mk-festive">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="text-[52px] leading-none mk-float" aria-hidden>🎅</div>
          <div className="flex-1">
            <h1 className="text-[22px] font-bold text-white">Secret Santa</h1>
            <p className="text-[13px] text-white/70 mt-1 max-w-[520px]">{L(vi, 'Add your friends, draw names, and send each person a private link. Everyone only sees who they are gifting — the surprise stays a surprise.', 'Thêm bạn bè, bốc thăm, rồi gửi cho mỗi người một link riêng. Ai cũng chỉ biết mình tặng quà cho ai — bất ngờ vẫn giữ nguyên.')}</p>
          </div>
          <Button variant="primary" onClick={() => setEditing(true)}><Plus size={15} />{L(vi, 'New group', 'Tạo nhóm')}</Button>
        </div>
      </div>

      {incoming && <RevealCard ticket={incoming} vi={vi} onClose={() => { setIncoming(null); if (window.location.hash.startsWith('#santa-')) window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#santa`) }} />}

      {tickets.length > 0 && (
        <Card className="p-4 sm:p-5">
          <div className="text-[14px] font-semibold mb-3">{L(vi, 'Your draws', 'Thăm của bạn')}</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {tickets.map((t) => (
              <button key={`${t.c}-${t.f}`} onClick={() => setIncoming(t)} className="mk-contact text-left flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
                <span className="text-[26px]" aria-hidden>🎁</span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold truncate">{t.g}</div>
                  <div className={`text-[12px] ${T.mute}`}>{L(vi, `You gift ${t.t}`, `Bạn tặng ${t.t}`)}{t.b ? ` · ${t.b} USDC` : ''}</div>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4 sm:p-5">
        <div className="text-[14px] font-semibold mb-3">{L(vi, 'Groups you organise', 'Nhóm bạn tổ chức')}</div>
        {groups.length === 0 ? (
          <EmptyState icon={Dices} title={L(vi, 'No groups yet', 'Chưa có nhóm nào')} desc={L(vi, 'Create a group for your team, family or friends — at least 3 people.', 'Tạo nhóm cho công ty, gia đình hay bạn bè — tối thiểu 3 người.')} action={<Button variant="primary" onClick={() => setEditing(true)}><Plus size={14} />{L(vi, 'New group', 'Tạo nhóm')}</Button>} />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {groups.map((g) => (
              <button key={g.id} onClick={() => setOpenId(g.id)} className="mk-contact text-left p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[15px] font-semibold truncate">{g.name}</div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${g.pairs.length ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>{g.pairs.length ? L(vi, 'Drawn', 'Đã bốc thăm') : L(vi, 'Not drawn', 'Chưa bốc')}</span>
                </div>
                <div className={`text-[12px] mt-1 ${T.mute}`}>{g.members.length} {L(vi, 'people', 'người')} · {g.budget} USDC · {fmtDay(g.date, vi)}</div>
                <div className="flex -space-x-2 mt-3">
                  {g.members.slice(0, 8).map((m) => <span key={m.address} className="rounded-full ring-2 ring-[#121219]"><Avatar size={26} seed={m.address} /></span>)}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <GroupEditor open={editing} vi={vi} onClose={() => setEditing(false)} onSave={(g) => { setGroups([g, ...groups]); setEditing(false); setOpenId(g.id) }} />
      {open && <GroupView group={open} vi={vi} onClose={() => setOpenId(null)} onChange={(g) => setGroups(groups.map((x) => (x.id === g.id ? g : x)))} onDelete={() => { setGroups(groups.filter((x) => x.id !== open.id)); setOpenId(null) }} />}
    </div>
  )
}

function GroupEditor({ open, vi, onClose, onSave }: { open: boolean; vi: boolean; onClose: () => void; onSave: (g: SantaGroup) => void }) {
  const { contacts, address, live } = useWallet()
  const year = new Date().getFullYear()
  const [name, setName] = useState('')
  const [budget, setBudget] = useState('10')
  const [date, setDate] = useState(`${year}-12-24`)
  const [organizer, setOrganizer] = useState('')
  const [members, setMembers] = useState<SantaMember[]>([])
  const [mName, setMName] = useState('')
  const [mAddr, setMAddr] = useState('')
  const [mWish, setMWish] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(L(vi, 'Christmas gift swap', 'Đổi quà Giáng sinh')); setBudget('10'); setDate(`${year}-12-24`); setOrganizer(''); setMembers([]); setMName(''); setMAddr(''); setMWish(''); setErr(null)
  }, [open, vi, year])

  const add = (m: SantaMember) => {
    if (!m.name.trim()) return setErr(L(vi, 'Enter a name', 'Nhập tên'))
    if (!isAddress(m.address.trim())) return setErr(L(vi, 'Enter a valid wallet address (0x…)', 'Nhập địa chỉ ví hợp lệ (0x…)'))
    if (members.some((x) => same(x.address, m.address))) return setErr(L(vi, 'This address is already in the group', 'Địa chỉ này đã có trong nhóm'))
    setMembers([...members, { name: m.name.trim().slice(0, 40), address: m.address.trim(), ...(m.wish?.trim() ? { wish: m.wish.trim().slice(0, 140) } : {}) }])
    setMName(''); setMAddr(''); setMWish(''); setErr(null)
  }
  const amount = Number(budget)
  const ready = name.trim() && members.length >= 3 && Number.isFinite(amount) && amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date)

  return (
    <Modal open={open} onClose={onClose} title={L(vi, 'New Secret Santa group', 'Tạo nhóm Secret Santa')} width={560}>
      <div className="space-y-4">
        <Field label={L(vi, 'Group name', 'Tên nhóm')}><input className={inputCls} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={L(vi, 'Budget per gift (USDC)', 'Ngân sách mỗi món (USDC)')}><input className={inputCls} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, '').slice(0, 10))} /></Field>
          <Field label={L(vi, 'Gift day', 'Ngày tặng quà')}><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label={L(vi, 'Your name (organiser)', 'Tên bạn (người tổ chức)')}><input className={inputCls} value={organizer} maxLength={40} placeholder="Makoto" onChange={(e) => setOrganizer(e.target.value)} /></Field>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] font-semibold">{L(vi, 'Members', 'Thành viên')} <span className={T.mute}>({members.length})</span></div>
            {live && address && !members.some((m) => same(m.address, address)) && <button className="text-[12px] text-neon-300 hover:underline" onClick={() => add({ name: organizer.trim() || L(vi, 'Me', 'Tôi'), address })}>+ {L(vi, 'Add me', 'Thêm tôi')}</button>}
          </div>
          {members.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {members.map((m, i) => (
                <div key={m.address} className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.03] border border-white/[0.06] mk-in">
                  <Avatar size={28} seed={m.address} emoji={contacts.find((c) => same(c.address, m.address))?.emoji} tone={contacts.find((c) => same(c.address, m.address))?.tone} photo={contacts.find((c) => same(c.address, m.address))?.photo} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate">{m.name}</div>
                    <div className={`text-[11px] truncate ${T.mute}`}>{short(m.address)}{m.wish ? ` · 💭 ${m.wish}` : ''}</div>
                  </div>
                  <button className={`p-1.5 rounded-lg ${T.mute} hover:text-white hover:bg-white/10`} onClick={() => setMembers(members.filter((_, j) => j !== i))} aria-label="Remove"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
          {contacts.filter((c) => !members.some((m) => same(m.address, c.address))).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {contacts.filter((c) => !members.some((m) => same(m.address, c.address))).slice(0, 12).map((c) => (
                <button key={c.address} onClick={() => add({ name: c.name, address: c.address })} className="inline-flex items-center gap-1.5 h-8 pl-1 pr-2.5 rounded-full bg-white/[0.05] border border-white/[0.08] hover:border-neon-400/50 text-[12px]">
                  <Avatar size={22} seed={c.address} emoji={c.emoji} tone={c.tone} photo={c.photo} />{c.name}<Plus size={12} className={T.mute} />
                </button>
              ))}
            </div>
          )}
          <div className="grid sm:grid-cols-[1fr_1.4fr] gap-2">
            <input className={inputCls} placeholder={L(vi, 'Name', 'Tên')} value={mName} maxLength={40} onChange={(e) => setMName(e.target.value)} />
            <input className={inputCls} placeholder="0x…" value={mAddr} onChange={(e) => setMAddr(e.target.value.trim())} />
          </div>
          <div className="flex gap-2 mt-2">
            <input className={inputCls} placeholder={L(vi, 'Wish (optional) — e.g. loves coffee', 'Mong muốn (không bắt buộc) — vd: thích cà phê')} value={mWish} maxLength={140} onChange={(e) => setMWish(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add({ name: mName, address: mAddr, wish: mWish })} />
            <Button className="shrink-0 !h-12" onClick={() => add({ name: mName, address: mAddr, wish: mWish })}><UserPlus size={15} /></Button>
          </div>
          {err && <p className="text-[12px] text-rose-300 mt-2">{err}</p>}
        </div>

        <Button variant="primary" size="lg" className="w-full" disabled={!ready} onClick={() => onSave({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim(), budget: String(amount), date, created: Date.now(), organizer: organizer.trim() || 'Makoto', members, pairs: [] })}>
          {members.length < 3 ? L(vi, `Add ${3 - members.length} more ${3 - members.length === 1 ? 'person' : 'people'}`, `Thêm ít nhất ${3 - members.length} người nữa`) : L(vi, 'Create group', 'Tạo nhóm')}
        </Button>
      </div>
    </Modal>
  )
}

function GroupView({ group, vi, onClose, onChange, onDelete }: { group: SantaGroup; vi: boolean; onClose: () => void; onChange: (g: SantaGroup) => void; onDelete: () => void }) {
  const { notify } = useWallet()
  const [rolling, setRolling] = useState(false)
  const [slot, setSlot] = useState(0)
  const [peek, setPeek] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const drawn = group.pairs.length === group.members.length

  useEffect(() => {
    if (!rolling) return
    const id = window.setInterval(() => setSlot((s) => (s + 1) % group.members.length), 90)
    const done = window.setTimeout(() => {
      window.clearInterval(id)
      onChange({ ...group, pairs: drawPairs(group.members.length) })
      setRolling(false)
    }, 1800)
    return () => { window.clearInterval(id); window.clearTimeout(done) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolling])

  // Direct USDC sends from each giver to their match since the group was created.
  const status = useQuery({
    queryKey: ['santa-status', group.id, group.pairs.join(',')],
    enabled: drawn,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const year = new Date(group.created).getFullYear()
      const results = await Promise.all(group.members.map(async (m, i) => {
        try {
          const txs = await fetchYearTransfers(m.address, year, signal)
          const to = group.members[group.pairs[i]].address.toLowerCase()
          return txs.some((t) => t.direction === 'out' && t.counterparty.toLowerCase() === to && t.time >= group.created - 60_000)
        } catch { return null }
      }))
      return results
    },
  })

  const share = async (i: number) => {
    const link = ticketLink(ticketFor(group, i))
    const text = L(vi, `🎅 ${group.members[i].name}, your Secret Santa draw for "${group.name}" is ready. Open privately:`, `🎅 ${group.members[i].name} ơi, thăm Secret Santa của nhóm "${group.name}" đây. Mở riêng nhé:`)
    try {
      if (navigator.share) { await navigator.share({ text, url: link }); return }
    } catch (e) { if ((e as Error)?.name === 'AbortError') return }
    void copyText(`${text} ${link}`, notify, L(vi, 'Link copied', 'Đã sao chép link'))
  }

  return (
    <Modal open onClose={onClose} title={group.name} width={560}>
      <div className="space-y-4">
        <div className={`text-[13px] ${T.sub}`}>{group.members.length} {L(vi, 'people', 'người')} · {group.budget} USDC {L(vi, 'each', 'mỗi món')} · {fmtDay(group.date, vi)}</div>

        {!drawn ? (
          <div className="text-center py-4">
            <div className="h-[72px] overflow-hidden flex items-center justify-center">
              {rolling ? <div key={slot} className="mk-slot text-[28px] font-black">{group.members[slot]?.name}</div> : <div className="text-[56px] mk-float" aria-hidden>🎩</div>}
            </div>
            <p className={`text-[13px] mt-2 mb-4 ${T.sub}`}>{L(vi, 'Everyone gets one person to gift. Nobody draws themselves.', 'Mỗi người bốc được một người để tặng. Không ai bốc trúng chính mình.')}</p>
            <Button variant="primary" size="lg" disabled={rolling} onClick={() => setRolling(true)}><Dices size={16} />{rolling ? L(vi, 'Drawing…', 'Đang bốc thăm…') : L(vi, 'Draw names', 'Bốc thăm')}</Button>
          </div>
        ) : (
          <>
            <div className="rounded-2xl bg-emerald-400/10 border border-emerald-400/25 p-3 text-[13px] text-emerald-200 mk-pop">🎉 {L(vi, 'Names drawn! Send each person their own link — it only shows who they gift.', 'Đã bốc thăm xong! Gửi cho mỗi người link riêng — link chỉ cho biết người đó tặng ai.')}</div>
            <div className="space-y-1.5">
              {group.members.map((m, i) => {
                const sent = status.data?.[i]
                return (
                  <div key={m.address} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] mk-in" style={{ animationDelay: `${i * 0.04}s` }}>
                    <Avatar size={30} seed={m.address} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{m.name}{peek && <span className={T.mute}> → {group.members[group.pairs[i]].name}</span>}</div>
                      <div className={`text-[11px] ${sent ? 'text-emerald-300' : T.mute}`}>{status.isLoading ? L(vi, 'Checking…', 'Đang kiểm tra…') : sent ? `✓ ${L(vi, 'Gift sent', 'Đã gửi quà')}` : L(vi, 'Waiting for gift', 'Chưa thấy gửi quà')}</div>
                    </div>
                    <Button size="sm" onClick={() => void copyText(ticketLink(ticketFor(group, i)), notify, L(vi, 'Link copied', 'Đã sao chép link'))} aria-label="Copy"><Copy size={13} /></Button>
                    <Button size="sm" variant="primary" onClick={() => void share(i)}><Share2 size={13} />{L(vi, 'Send', 'Gửi')}</Button>
                  </div>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPeek(!peek)}>{peek ? <EyeOff size={13} /> : <Eye size={13} />}{peek ? L(vi, 'Hide pairs', 'Ẩn cặp') : L(vi, 'Peek at pairs', 'Xem các cặp')}</Button>
              <Button size="sm" variant="ghost" onClick={() => status.refetch()}><RefreshCw size={13} />{L(vi, 'Check gifts', 'Kiểm tra quà')}</Button>
              <Button size="sm" variant="ghost" onClick={() => { onChange({ ...group, pairs: [] }); setPeek(false) }}><Dices size={13} />{L(vi, 'Draw again', 'Bốc lại')}</Button>
            </div>
            <p className={`text-[11px] ${T.mute}`}>{L(vi, 'Gift status checks direct USDC/EURC sends between the pair on Arc. Drawing again makes the old links show the old match.', '"Đã gửi quà" được kiểm tra từ giao dịch USDC/EURC trực tiếp giữa hai người trên Arc. Nếu bốc lại, link cũ vẫn hiện kết quả cũ.')}</p>
          </>
        )}

        <div className="pt-2 border-t border-white/[0.06] flex justify-end">
          {confirmDel
            ? <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>{L(vi, 'Cancel', 'Huỷ')}</Button><Button size="sm" variant="danger" onClick={onDelete}><Trash2 size={13} />{L(vi, 'Delete group', 'Xoá nhóm')}</Button></div>
            : <Button size="sm" variant="ghost" onClick={() => setConfirmDel(true)}><Trash2 size={13} />{L(vi, 'Delete', 'Xoá')}</Button>}
        </div>
      </div>
    </Modal>
  )
}

function RevealCard({ ticket, vi, onClose }: { ticket: SantaTicket; vi: boolean; onClose: () => void }) {
  const { go, setSendDraft, contacts, setContacts, notify } = useWallet()
  const [flipped, setFlipped] = useState(false)
  const saved = useMemo(() => contacts.some((c) => same(c.address, ticket.a)), [contacts, ticket.a])
  return (
    <div className="mk-in">
      <div className={`mk-flip ${flipped ? 'is-flipped' : ''} max-w-[460px] mx-auto`}>
        <div className="mk-flip-inner min-h-[420px]">
          <button onClick={() => setFlipped(true)} className="mk-flip-face w-full min-h-[420px] rounded-[26px] border border-rose-300/30 p-6 flex flex-col items-center justify-center text-center text-white" style={{ background: 'radial-gradient(90% 80% at 50% 0%, rgba(239,68,68,.45), transparent 65%), radial-gradient(80% 80% at 50% 100%, rgba(34,197,94,.3), transparent 60%), #1a0f14' }}>
            <div className="text-[64px] mk-float" aria-hidden>🎅</div>
            <div className="text-[13px] uppercase tracking-[.2em] text-white/60 mt-3">Secret Santa · {ticket.g}</div>
            <div className="text-[22px] font-bold mt-2">{L(vi, `Hi ${ticket.f}!`, `Chào ${ticket.f}!`)}</div>
            <p className="text-[14px] text-white/75 mt-1">{L(vi, 'Make sure nobody is looking, then tap to reveal who you are gifting.', 'Đảm bảo không ai nhìn trộm, rồi chạm để xem bạn sẽ tặng quà cho ai.')}</p>
            <span className="mt-5 inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-rose-500 text-white text-[14px] font-semibold mk-breathe"><Gift size={16} />{L(vi, 'Reveal', 'Mở thăm')}</span>
          </button>
          <div className="mk-flip-face mk-flip-back rounded-[26px] border border-emerald-300/30 p-6 flex flex-col items-center justify-center text-center text-white" style={{ background: 'radial-gradient(90% 80% at 50% 0%, rgba(34,197,94,.4), transparent 65%), radial-gradient(80% 80% at 50% 100%, rgba(239,68,68,.3), transparent 60%), #0f1a14' }}>
            <div className="text-[13px] text-white/70">{L(vi, 'You are the Secret Santa of', 'Bạn là Ông già Noel bí mật của')}</div>
            <div className="my-3 rounded-full p-1 bg-gradient-to-br from-rose-400 to-emerald-400"><Avatar size={72} seed={ticket.a} /></div>
            <div className="text-[30px] font-black leading-tight">{ticket.t}</div>
            <div className="text-[12px] text-white/55 mt-0.5">{short(ticket.a)}</div>
            {ticket.w && <div className="mt-3 px-3 py-2 rounded-xl bg-white/10 text-[13px]">💭 {ticket.w}</div>}
            <div className="text-[13px] text-white/75 mt-3">{ticket.b ? `${ticket.b} USDC` : ''}{ticket.d ? ` · ${L(vi, 'by', 'trước')} ${fmtDay(ticket.d, vi)}` : ''}</div>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <Button variant="primary" onClick={() => { setSendDraft({ to: ticket.a, amount: ticket.b, symbol: 'USDC' }); go('send') }}><ArrowUpRight size={14} />{L(vi, 'Send now', 'Gửi ngay')}</Button>
              <Button onClick={() => go('gifts')}><Gift size={14} />{L(vi, 'Gift box link', 'Gói hộp quà')}</Button>
              {!saved && <Button variant="ghost" onClick={() => { setContacts([...contacts, { name: ticket.t, address: ticket.a }]); notify(L(vi, 'Saved to contacts', 'Đã lưu vào danh bạ')) }}><UserPlus size={14} /></Button>}
              {saved && <span className="inline-flex items-center gap-1 text-[12px] text-emerald-300"><Check size={13} />{L(vi, 'In contacts', 'Có trong danh bạ')}</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="text-center mt-2"><button onClick={onClose} className={`text-[12px] ${T.mute} hover:text-white`}>{L(vi, 'Close', 'Đóng')}</button></div>
    </div>
  )
}
