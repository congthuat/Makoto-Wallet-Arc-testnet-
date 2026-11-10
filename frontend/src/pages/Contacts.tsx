import { useMemo, useState } from 'react'
import { ArrowUpRight, BookUser, Check, Copy, ExternalLink, Pencil, Plus, Search, Sparkles, Trash2, UserPlus, X } from 'lucide-react'
import { useWallet } from '../lib/store'
import { useT } from '../lib/i18n'
import { ARC, isAddress, short, type Contact } from '../lib/wallet'
import { randomAvatar } from '../lib/contactAvatars'
import { Avatar, Button, Card, EmptyState, Field, Modal, PageHeader, T, inputCls } from '../components/wallet/ui'
import { copyText } from '../components/wallet/shared'
import { AvatarGrid, AvatarPickerModal, type AvatarChoice } from '../components/AvatarPicker'

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

type Editing = { mode: 'add' | 'edit'; original?: string; name: string; address: string; avatar: AvatarChoice }

export default function ContactsPage() {
  const [tr] = useT()
  const { contacts, setContacts, notify, go, setSendDraft, activity } = useWallet()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [picking, setPicking] = useState<Contact | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = [...contacts].reverse()
    return q ? rows.filter((c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q)) : rows
  }, [contacts, query])

  // Addresses you already paid but never saved — one tap to add them.
  const suggestions = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const tx of activity ?? []) {
      if (tx.direction !== 'out' || !isAddress(tx.counterparty)) continue
      const key = tx.counterparty.toLowerCase()
      if (seen.has(key) || contacts.some((c) => same(c.address, key))) continue
      seen.add(key)
      out.push(tx.counterparty)
      if (out.length >= 4) break
    }
    return out
  }, [activity, contacts])

  const openAdd = (address = '') => setEditing({ mode: 'add', name: '', address, avatar: randomAvatar() })
  const openEdit = (c: Contact) => setEditing({ mode: 'edit', original: c.address, name: c.name, address: c.address, avatar: { emoji: c.emoji, tone: c.tone } })

  const sendTo = (c: Contact) => { setSendDraft({ to: c.address }); go('send') }
  const remove = (c: Contact) => {
    setContacts(contacts.filter((x) => !same(x.address, c.address)))
    setConfirmDelete(null)
    notify(tr('Contact deleted'))
  }

  return (
    <>
      <PageHeader
        eyebrow="Wallet"
        title="Contacts"
        desc="Save the people you pay often. Pick an avatar so you always send to the right person."
        right={<Button variant="primary" onClick={() => openAdd()}><UserPlus size={15} />{tr('Add contact')}</Button>}
      />

      <div className="max-w-[1040px] space-y-5">
        {contacts.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mk-in">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${T.mute}`} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Search name or address')} className={`${inputCls} h-11 pl-10 text-[14px] rounded-xl`} />
              {query && <button onClick={() => setQuery('')} className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg ${T.mute} hover:text-white`} aria-label={tr('Clear')}><X size={14} /></button>}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {contacts.slice(-5).reverse().map((c) => <span key={c.address} className="rounded-full ring-2 ring-[#0b0b10]"><Avatar size={28} seed={c.address} emoji={c.emoji} tone={c.tone} /></span>)}
              </div>
              <span className={`text-[13px] ${T.sub}`}>{tr('{n} saved').replace('{n}', String(contacts.length))}</span>
            </div>
          </div>
        )}

        {suggestions.length > 0 && (
          <Card className="p-4 mk-in">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={15} className="text-neon-300" />
              <span className="text-[13.5px] font-semibold">{tr('People you paid recently')}</span>
              <span className={`text-[12px] ${T.mute}`}>· {tr('save them in one tap')}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((a) => (
                <button key={a} onClick={() => openAdd(a)} className="group inline-flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full bg-white/[0.04] border border-white/[0.08] hover:border-neon-400/40 hover:bg-neon-500/10 transition">
                  <Avatar size={24} seed={a} />
                  <span className="font-mono text-[12px]">{short(a)}</span>
                  <Plus size={13} className="text-neon-300 transition-transform group-hover:rotate-90" />
                </button>
              ))}
            </div>
          </Card>
        )}

        {contacts.length === 0 ? (
          <Card>
            <EmptyState icon={BookUser} title="No contacts yet" desc="Save frequent recipients to send faster and avoid address mistakes."
              action={<Button variant="primary" onClick={() => openAdd()}><UserPlus size={15} />{tr('Add your first contact')}</Button>} />
          </Card>
        ) : list.length === 0 ? (
          <Card><div className={`py-12 text-center text-[13.5px] ${T.mute}`}><Search size={18} className="mx-auto mb-2" />{tr('No contact matches your search.')}</div></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c, i) => (
              <section key={c.address} className="mk-contact mk-in relative rounded-2xl border border-white/[0.08] bg-[#121219] p-4 overflow-hidden" style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}>
                <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-[0.12] blur-2xl pointer-events-none" style={{ background: c.emoji ? 'radial-gradient(closest-side,#D4FF3A,transparent)' : 'radial-gradient(closest-side,#8b5cf6,transparent)' }} aria-hidden />
                <div className="relative flex items-center gap-3">
                  <button type="button" onClick={() => setPicking(c)} className="mk-contact-av-btn relative rounded-full focus:outline-none" aria-label={tr('Change avatar')} title={tr('Change avatar')}>
                    <span className="mk-contact-av block"><Avatar size={52} seed={c.address} emoji={c.emoji} tone={c.tone} /></span>
                    <span className="mk-contact-edit absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-neon-500 text-[#0b0b10] flex items-center justify-center shadow-lg"><Pencil size={10} strokeWidth={2.6} /></span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold truncate">{c.name}</div>
                    <button onClick={() => copyText(c.address, notify, tr('Address copied'))} className={`inline-flex items-center gap-1.5 font-mono text-[12px] ${T.mute} hover:text-white transition`} title={c.address}>
                      {short(c.address)}<Copy size={11} />
                    </button>
                  </div>
                  <button onClick={() => openEdit(c)} className={`p-2 rounded-lg ${T.mute} hover:text-white hover:bg-white/10 transition`} aria-label={tr('Edit contact')}><Pencil size={14} /></button>
                </div>

                {confirmDelete === c.address ? (
                  <div className="relative mt-4 flex items-center gap-2 mk-in">
                    <span className="text-[12.5px] text-rose-300 flex-1">{tr('Delete this contact?')}</span>
                    <Button size="sm" onClick={() => setConfirmDelete(null)}>{tr('Cancel')}</Button>
                    <Button size="sm" variant="danger" onClick={() => remove(c)}>{tr('Delete')}</Button>
                  </div>
                ) : (
                  <div className="relative mt-4 flex items-center gap-2">
                    <Button size="sm" variant="primary" className="flex-1" onClick={() => sendTo(c)}><ArrowUpRight size={14} />{tr('Send')}</Button>
                    <a href={`${ARC.explorer}/address/${c.address}`} target="_blank" rel="noreferrer" className={`h-8 w-8 inline-flex items-center justify-center rounded-lg bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.09] ${T.sub}`} aria-label={tr('Open explorer')}><ExternalLink size={13} /></a>
                    <button onClick={() => setConfirmDelete(c.address)} className={`h-8 w-8 inline-flex items-center justify-center rounded-lg bg-white/[0.05] border border-white/[0.08] hover:text-rose-300 hover:bg-rose-500/10 hover:border-rose-400/30 transition ${T.mute}`} aria-label={tr('Delete contact')}><Trash2 size={13} /></button>
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>

      <ContactEditor
        editing={editing}
        onClose={() => setEditing(null)}
        contacts={contacts}
        onSave={(next, original) => {
          if (original) setContacts(contacts.map((x) => (same(x.address, original) ? next : x)))
          else setContacts([...contacts, next])
          notify(tr('Contact saved'))
          setEditing(null)
        }}
      />

      <AvatarPickerModal
        open={!!picking}
        onClose={() => setPicking(null)}
        name={picking?.name ?? ''}
        seed={picking?.address ?? ''}
        value={{ emoji: picking?.emoji, tone: picking?.tone }}
        onSave={(v) => { if (picking) setContacts(contacts.map((x) => (same(x.address, picking.address) ? { ...x, emoji: v.emoji, tone: v.tone } : x))) }}
      />
    </>
  )
}

function ContactEditor({ editing, onClose, contacts, onSave }: {
  editing: Editing | null; onClose: () => void; contacts: Contact[]; onSave: (c: Contact, original?: string) => void
}) {
  const [tr] = useT()
  const [draft, setDraft] = useState<Editing | null>(editing)
  const [prev, setPrev] = useState<Editing | null>(editing)
  const [showGrid, setShowGrid] = useState(false)
  if (editing !== prev) { setPrev(editing); setDraft(editing); setShowGrid(false) }
  if (!draft) return null

  const addr = draft.address.trim()
  const dup = isAddress(addr) && contacts.some((c) => same(c.address, addr) && !(draft.original && same(draft.original, addr)))
  const addrError = addr && !isAddress(addr) ? tr('That is not a valid 0x address.') : dup ? tr('This address is already in your contacts.') : null
  const ok = draft.name.trim() && isAddress(addr) && !dup

  return (
    <Modal open={!!editing} onClose={onClose} title={tr(draft.mode === 'add' ? 'Add contact' : 'Edit contact')} width={520}>
      <div className="flex items-center gap-4 mb-4">
        <button type="button" onClick={() => setShowGrid((v) => !v)} className="group relative rounded-full focus:outline-none" aria-label={tr('Choose avatar')}>
          <div className="absolute inset-0 rounded-full bg-neon-400/20 blur-xl mk-breathe" aria-hidden />
          <div key={`${draft.avatar.emoji}-${draft.avatar.tone}`} className="relative mk-pop transition-transform group-hover:scale-105"><Avatar size={64} seed={addr || 'makoto'} emoji={draft.avatar.emoji} tone={draft.avatar.tone} /></div>
          <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-neon-500 text-[#0b0b10] flex items-center justify-center shadow-lg"><Pencil size={11} strokeWidth={2.6} /></span>
        </button>
        <div className="min-w-0">
          <div className="text-[16px] font-semibold truncate">{draft.name.trim() || tr('New contact')}</div>
          <button type="button" onClick={() => setShowGrid((v) => !v)} className="text-[12.5px] text-neon-300 hover:text-neon-200 font-medium">{tr(showGrid ? 'Hide avatars' : 'Choose avatar')}</button>
        </div>
      </div>

      {showGrid && <div className="mb-4 mk-in"><AvatarGrid value={draft.avatar} onChange={(avatar) => setDraft({ ...draft, avatar })} seed={addr || 'makoto'} /></div>}

      <div className="space-y-3">
        <Field label={tr('Name')}>
          <input autoFocus value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={tr('e.g. Nam')} className={`${inputCls} h-11 text-[14px] rounded-xl`} />
        </Field>
        <Field label={tr('Wallet address')} error={addrError}>
          <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="0x…" spellCheck={false} className={`${inputCls} h-11 text-[13px] rounded-xl font-mono`} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-5">
        <Button onClick={onClose}>{tr('Cancel')}</Button>
        <Button variant="primary" disabled={!ok} onClick={() => onSave({ name: draft.name.trim(), address: addr, emoji: draft.avatar.emoji, tone: draft.avatar.tone }, draft.original)}>
          <Check size={15} />{tr('Save contact')}
        </Button>
      </div>
    </Modal>
  )
}
