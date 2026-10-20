import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store.ts'
import { api } from '../lib/api.ts'
import { Card, Button, Badge, Icons, Input, Select, Textarea, EmptyState, ConfirmDialog, Spinner, Field } from '../components/ui.tsx'
import type { ChatInfo, SequenceJob } from '../lib/types.ts'

export default function Messaging() {
  const accounts = useStore((s) => s.accounts)
  const toast = useStore((s) => s.toast)

  const connected = useMemo(() => accounts.filter((a) => a.status === 'connected'), [accounts])
  const [accountId, setAccountId] = useState('')
  const [chats, setChats] = useState<ChatInfo[] | null>(null)
  const [chatsLoading, setChatsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedJid, setSelectedJid] = useState('')
  const [text, setText] = useState('')
  const [delayMs, setDelayMs] = useState(3000)
  const [mode, setMode] = useState<'single' | 'sequence'>('single')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)
  const [sending, setSending] = useState(false)
  const [activeSeq, setActiveSeq] = useState<SequenceJob | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [manualJid, setManualJid] = useState('')

  // Pick first connected account by default
  useEffect(() => {
    if (!accountId && connected.length > 0) setAccountId(connected[0].id)
    if (accountId && !connected.find((a) => a.id === accountId)) setAccountId(connected[0]?.id || '')
  }, [connected, accountId])

  // Load chats when account selected
  useEffect(() => {
    if (!accountId) return
    let alive = true
    setChatsLoading(true)
    setSelectedJid('')
    api
      .chats(accountId)
      .then((c) => {
        if (alive) setChats(c)
      })
      .catch((err) => {
        if (alive) {
          setChats([])
          toast('error', err instanceof Error ? err.message : 'Failed to load chats')
        }
      })
      .finally(() => {
        if (alive) setChatsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [accountId, toast])

  // Track active sequence
  useEffect(() => {
    if (!accountId) return
    api.sequences(accountId).then((seqs) => {
      const running = seqs.find((s) => s.status === 'running')
      if (running) setActiveSeq(running)
    }).catch(() => {})
  }, [accountId])

  const filtered = useMemo(() => {
    if (!chats) return []
    const q = search.trim().toLowerCase()
    if (!q) return chats
    return chats.filter((c) => c.name.toLowerCase().includes(q) || c.jid.toLowerCase().includes(q))
  }, [chats, search])

  const groups = filtered.filter((c) => c.isGroup)
  const individuals = filtered.filter((c) => !c.isGroup)
  const selected = chats?.find((c) => c.jid === selectedJid)

  const messages = useMemo(() => text.split('\n').filter((l) => l.trim().length > 0), [text])
  const targetJid = selectedJid || manualJid

  const doSend = async (confirmed: boolean) => {
    if (!accountId || !targetJid) return
    if (mode === 'single') {
      setSending(true)
      try {
        await api.sendMessage(accountId, targetJid, text.trim())
        toast('success', 'Message sent')
        setText('')
        setPreviewOpen(false)
        setConfirmSend(false)
      } catch (err) {
        const body = (err as { body?: { needsConfirm?: boolean } }).body
        if (body?.needsConfirm) {
          setPreviewOpen(false)
          setConfirmSend(true)
          return
        }
        toast('error', err instanceof Error ? err.message : 'Send failed')
      } finally {
        setSending(false)
      }
    } else {
      setSending(true)
      try {
        const job = await api.sendSequence(accountId, targetJid, messages, delayMs, confirmed)
        setActiveSeq(job)
        toast('success', `Sequence started (${messages.length} messages)`)
        setPreviewOpen(false)
        setConfirmSend(false)
        setShowCompose(false)
      } catch (err) {
        const body = (err as { body?: { needsConfirm?: boolean } }).body
        if (body?.needsConfirm) {
          setPreviewOpen(false)
          setConfirmSend(true)
          return
        }
        toast('error', err instanceof Error ? err.message : 'Send failed')
      } finally {
        setSending(false)
      }
    }
  }

  const cancelSeq = async () => {
    if (!activeSeq) return
    try {
      await api.cancelSequence(activeSeq.id)
      toast('info', 'Sequence cancelled')
      setActiveSeq(null)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Cancel failed')
    }
  }

  const canSend = Boolean(accountId && targetJid && text.trim() && !sending && !activeSeq)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Messaging</h2>
          <p className="mt-1 text-sm text-zinc-500">Send messages with rate limiting and sequence support.</p>
        </div>
        <Button variant="primary" onClick={() => setShowCompose((v) => !v)} disabled={connected.length === 0}>
          <Icons.send size={15} /> Compose
        </Button>
      </div>

      {connected.length === 0 ? (
        <EmptyState
          icon={<Icons.unplug size={34} />}
          title="No connected accounts"
          subtitle="Connect at least one WhatsApp account on the Accounts page before sending messages."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Chat list */}
          <Card pad={false} className="overflow-hidden lg:col-span-1">
            <div className="border-b border-zinc-800/80 p-4">
              <Field label="Account">
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {connected.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.pushName || 'linked'})
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="relative mt-3">
                <Icons.search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats & groups…" className="pl-8" />
              </div>
            </div>
            <div className="max-h-[480px] overflow-y-auto">
              {chatsLoading ? (
                <div className="flex justify-center py-10 text-blue-500">
                  <Spinner size={22} />
                </div>
              ) : !chats || chats.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-zinc-600">No chats found. Connect and open WhatsApp on your phone to sync history.</p>
              ) : (
                <>
                  {groups.length > 0 && (
                    <>
                      <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Groups ({groups.length})</p>
                      {groups.map((c) => (
                        <ChatRow key={c.jid} chat={c} selected={c.jid === selectedJid} onSelect={() => { setSelectedJid(c.jid); setManualJid('') }} />
                      ))}
                    </>
                  )}
                  {individuals.length > 0 && (
                    <>
                      <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Individuals ({individuals.length})</p>
                      {individuals.map((c) => (
                        <ChatRow key={c.jid} chat={c} selected={c.jid === selectedJid} onSelect={() => { setSelectedJid(c.jid); setManualJid('') }} />
                      ))}
                    </>
                  )}
                  {filtered.length === 0 && <p className="px-4 py-6 text-center text-sm text-zinc-600">No matches for "{search}"</p>}
                </>
              )}
            </div>
          </Card>

          {/* Composer */}
          <div className="space-y-4 lg:col-span-2">
            {!showCompose ? (
              <Card>
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <Icons.chat size={30} className="text-zinc-700" />
                  <p className="text-sm text-zinc-400">Select a chat on the left, then press Compose.</p>
                </div>
              </Card>
            ) : (
              <Card className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Send mode">
                    <Select value={mode} onChange={(e) => setMode(e.target.value as 'single' | 'sequence')}>
                      <option value="single">Single message</option>
                      <option value="sequence">Sequence (multiple messages)</option>
                    </Select>
                  </Field>
                  <Field label="Recipient" hint={selected ? selected.name : manualJid || 'Select a chat or enter a JID below'}>
                    <div className="flex gap-2">
                      <Input value={selectedJid || manualJid} onChange={(e) => { setManualJid(e.target.value); setSelectedJid('') }} placeholder="1234567890@s.whatsapp.net" />
                    </div>
                  </Field>
                </div>

                <Field
                  label={mode === 'sequence' ? 'Messages (one per line)' : 'Message'}
                  hint={
                    mode === 'sequence'
                      ? `${messages.length} message${messages.length === 1 ? '' : 's'} • sent sequentially with ${delayMs}ms between them`
                      : `${text.length}/6000 characters`
                  }
                >
                  <Textarea rows={mode === 'sequence' ? 6 : 4} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === 'sequence' ? 'Hey!\nHow are you?\nTalk soon' : 'Type your message…'} maxLength={mode === 'sequence' ? 100000 : 6000} />
                </Field>

                {mode === 'sequence' && (
                  <Field label="Delay between messages (ms)" hint="Minimum 500ms. Higher is safer and less spammy.">
                    <Input type="number" min={500} max={120000} step={500} value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value))} />
                  </Field>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800/80 pt-4">
                  <Button variant="ghost" onClick={() => setPreviewOpen(true)} disabled={!text.trim()}>
                    Preview
                  </Button>
                  <div className="flex-1" />
                  <Button variant="primary" onClick={() => (messages.length > 1 ? setConfirmSend(true) : doSend(false))} disabled={!canSend}>
                    <Icons.send size={14} />
                    {mode === 'sequence' ? `Send ${messages.length} messages` : 'Send'}
                  </Button>
                </div>
              </Card>
            )}

            {/* Active sequence tracker */}
            {activeSeq && (
              <Card className="border-blue-900/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Spinner size={15} className="text-blue-500" />
                    <span className="text-sm font-medium text-zinc-200">Sequence running</span>
                    <Badge color="blue">
                      {activeSeq.results.filter((r) => r.status === 'sent').length}/{activeSeq.messages.length} sent
                    </Badge>
                  </div>
                  <Button size="sm" variant="danger" onClick={cancelSeq}>
                    Cancel
                  </Button>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {activeSeq.messages.map((m, i) => {
                    const r = activeSeq.results.find((x) => x.index === i)
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span
                          className={`mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] ${
                            r?.status === 'sent' ? 'bg-emerald-600 text-white' : r?.status === 'error' ? 'bg-red-600 text-white' : r?.status === 'cancelled' ? 'bg-zinc-700 text-zinc-400' : 'bg-zinc-800 text-zinc-500'
                          }`}
                        >
                          {r?.status === 'sent' ? '✓' : r?.status === 'error' ? '!' : i + 1}
                        </span>
                        <span className={`truncate ${r?.status === 'sent' ? 'text-zinc-300' : 'text-zinc-500'}`}>{m}</span>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Preview dialog */}
      <ConfirmDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onConfirm={() => doSend(false)}
        loading={sending}
        title="Preview"
        message={`${mode === 'sequence' ? `${messages.length} messages to ${selected?.name || targetJid} with ${delayMs}ms between each` : `1 message to ${selected?.name || targetJid}`}:\n\n${messages.join(' · ')}`}
        confirmLabel="Send now"
      />

      {/* Multi-message confirmation */}
      <ConfirmDialog
        open={confirmSend}
        onClose={() => setConfirmSend(false)}
        onConfirm={() => doSend(true)}
        loading={sending}
        title="Confirm multi-message send"
        message={`You are about to send ${messages.length} messages to "${selected?.name || targetJid}" with a ${delayMs}ms delay. This cannot be recalled. Continue?`}
        confirmLabel={`Send ${messages.length} messages`}
      />
    </div>
  )
}

function ChatRow({ chat, selected, onSelect }: { chat: ChatInfo; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${selected ? 'bg-blue-600/15 ring-1 ring-inset ring-blue-600/30' : 'hover:bg-zinc-800/50'}`}
    >
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${chat.isGroup ? 'bg-indigo-900/70 text-indigo-300' : 'bg-zinc-800 text-zinc-400'}`}>
        {chat.isGroup ? <Icons.users size={14} /> : chat.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${selected ? 'text-blue-200' : 'text-zinc-200'}`}>{chat.name}</p>
        <p className="truncate text-[11px] text-zinc-600">{chat.isGroup ? `${chat.participants ?? '?'} members` : chat.jid.split('@')[0]}</p>
      </div>
      {chat.unread > 0 && <Badge color="blue">{chat.unread}</Badge>}
    </button>
  )
}
