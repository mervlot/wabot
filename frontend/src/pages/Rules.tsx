import { useEffect, useState, type FormEvent } from 'react'
import { useStore } from '../lib/store.ts'
import { api } from '../lib/api.ts'
import { Card, Button, Badge, Icons, Modal, Input, Select, Textarea, Toggle, EmptyState, ConfirmDialog, Field, StatusDot } from '../components/ui.tsx'
import type { AutoReplyRule, MatchMode } from '../lib/types.ts'

interface Draft {
  id: string | null
  name: string
  keywords: string[]
  matchMode: MatchMode
  replies: string[]
  replyMode: 'one' | 'all'
  delayMs: number
  cooldownSec: number
  priority: number
  accountIds: string[]
  targetChats: string[]
  enabled: boolean
}

const emptyDraft: Draft = {
  id: null,
  name: '',
  keywords: [],
  matchMode: 'ci',
  replies: [],
  replyMode: 'one',
  delayMs: 1500,
  cooldownSec: 30,
  priority: 10,
  accountIds: [],
  targetChats: [],
  enabled: true,
}

function RuleEditor({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial: AutoReplyRule | null; onSaved: () => void }) {
  const accounts = useStore((s) => s.accounts)
  const toast = useStore((s) => s.toast)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [kwInput, setKwInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setError('')
      if (initial) {
        setDraft({
          id: initial.id,
          name: initial.name,
          keywords: [...initial.keywords],
          matchMode: initial.matchMode,
          replies: [...initial.replies],
          replyMode: initial.replyMode,
          delayMs: initial.delayMs,
          cooldownSec: initial.cooldownSec,
          priority: initial.priority,
          accountIds: [...initial.accountIds],
          targetChats: [...initial.targetChats],
          enabled: initial.enabled,
        })
        setKwInput(initial.keywords.join(', '))
      } else {
        setDraft(emptyDraft)
        setKwInput('')
      }
    }
  }, [open, initial])

  const addReply = () => {
    setDraft((d) => ({ ...d, replies: [...d.replies, ''] }))
  }
  const setReply = (i: number, v: string) => {
    setDraft((d) => ({ ...d, replies: d.replies.map((r, idx) => (idx === i ? v : r)) }))
  }
  const removeReply = (i: number) => {
    setDraft((d) => ({ ...d, replies: d.replies.filter((_, idx) => idx !== i) }))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const keywords = kwInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    const replies = draft.replies.map((r) => r.trim()).filter(Boolean)
    if (!draft.name.trim()) return setError('Name is required')
    if (keywords.length === 0) return setError('Add at least one keyword (comma separated)')
    if (replies.length === 0) return setError('Add at least one reply')

    setBusy(true)
    setError('')
    const payload = {
      name: draft.name.trim(),
      keywords,
      matchMode: draft.matchMode,
      replies,
      replyMode: draft.replyMode,
      delayMs: draft.delayMs,
      cooldownSec: draft.cooldownSec,
      priority: draft.priority,
      accountIds: draft.accountIds,
      targetChats: draft.targetChats,
      enabled: draft.enabled,
    }
    try {
      if (draft.id) {
        await api.updateRule(draft.id, payload)
        toast('success', 'Rule updated')
      } else {
        await api.createRule(payload)
        toast('success', 'Rule created')
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Edit rule — ${initial.name}` : 'New auto-reply rule'} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rule name">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Greeting" maxLength={80} />
          </Field>
          <Field label="Match mode">
            <Select value={draft.matchMode} onChange={(e) => setDraft({ ...draft, matchMode: e.target.value as MatchMode })}>
              <option value="ci">Case-insensitive (contains / exact)</option>
              <option value="exact">Exact match (case-sensitive)</option>
              <option value="contains">Contains (case-sensitive)</option>
            </Select>
          </Field>
        </div>

        <Field label="Keywords / phrases" hint="Comma separated. Example: hello, hi, good morning">
          <Input value={kwInput} onChange={(e) => setKwInput(e.target.value)} placeholder="hello, hi, how far" />
        </Field>

        <div>
          <label className="label">Replies</label>
          <div className="space-y-2">
            {draft.replies.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 text-center text-xs text-zinc-600">{i + 1}</span>
                <Textarea rows={1} value={r} onChange={(e) => setReply(i, e.target.value)} placeholder={`Reply ${i + 1}…`} className="resize-none" />
                <button type="button" onClick={() => removeReply(i)} className="rounded-md p-1.5 text-zinc-500 hover:bg-red-950/60 hover:text-red-400" aria-label="Remove reply">
                  <Icons.x size={14} />
                </button>
              </div>
            ))}
            {draft.replies.length === 0 && <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-3 text-xs text-zinc-600">No replies yet — add at least one.</p>}
          </div>
          <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={addReply}>
            <Icons.plus size={13} /> Add reply
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Reply behaviour">
            <Select value={draft.replyMode} onChange={(e) => setDraft({ ...draft, replyMode: e.target.value as 'one' | 'all' })}>
              <option value="one">Send one (random)</option>
              <option value="all">Send all sequentially</option>
            </Select>
          </Field>
          <Field label="Delay between replies (ms)">
            <Input type="number" min={0} max={120000} step={100} value={draft.delayMs} onChange={(e) => setDraft({ ...draft, delayMs: Number(e.target.value) })} />
          </Field>
          <Field label="Cooldown (seconds)" hint="0 = none">
            <Input type="number" min={0} max={86400} value={draft.cooldownSec} onChange={(e) => setDraft({ ...draft, cooldownSec: Number(e.target.value) })} />
          </Field>
          <Field label="Priority" hint="Lower = wins first">
            <Input type="number" min={1} max={1000} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Accounts (empty = all)</label>
            <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2">
              {accounts.length === 0 ? (
                <p className="px-2 py-1 text-xs text-zinc-600">No accounts created yet.</p>
              ) : (
                accounts.map((a) => (
                  <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-900">
                    <input
                      type="checkbox"
                      className="accent-blue-600"
                      checked={draft.accountIds.includes(a.id)}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          accountIds: e.target.checked ? [...d.accountIds, a.id] : d.accountIds.filter((x) => x !== a.id),
                        }))
                      }
                    />
                    <StatusDot status={a.status} />
                    {a.name}
                  </label>
                ))
              )}
            </div>
          </div>
          <Field label="Target chat JIDs (empty = all)" hint="One per line, e.g. 123456@s.whatsapp.net or group@g.us">
            <Textarea
              rows={4}
              value={draft.targetChats.join('\n')}
              onChange={(e) => setDraft({ ...draft, targetChats: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
              placeholder="leave empty for all chats"
              className="font-mono text-xs"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5">
          <span className="text-sm text-zinc-300">Rule enabled</span>
          <Toggle checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} label="Rule enabled" />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-zinc-800/80 pt-4">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {draft.id ? 'Save changes' : 'Create rule'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Rules() {
  const rules = useStore((s) => s.rules)
  const refreshRules = useStore((s) => s.refreshRules)
  const toast = useStore((s) => s.toast)
  const accounts = useStore((s) => s.accounts)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<AutoReplyRule | null>(null)
  const [deleting, setDeleting] = useState<AutoReplyRule | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void refreshRules()
  }, [refreshRules])

  const toggle = async (rule: AutoReplyRule) => {
    try {
      await api.toggleRule(rule.id)
      await refreshRules()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Toggle failed')
    }
  }

  const remove = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await api.deleteRule(deleting.id)
      toast('success', 'Rule deleted')
      await refreshRules()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  const matchLabel = (m: MatchMode) => (m === 'ci' ? 'case-insensitive' : m === 'exact' ? 'exact' : 'contains')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Auto-Reply Rules</h2>
          <p className="mt-1 text-sm text-zinc-500">Keyword-triggered replies with cooldowns, priorities and loop protection.</p>
        </div>
        <Button variant="primary" onClick={() => { setEditing(null); setEditorOpen(true) }}>
          <Icons.plus size={15} /> New rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          icon={<Icons.rules size={34} />}
          title="No rules yet"
          subtitle={'Create a rule like: trigger "hello" -> reply "What\'s good bro?" with optional multi-reply and cooldown.'}
          action={
            <Button variant="primary" onClick={() => { setEditing(null); setEditorOpen(true) }}>
              <Icons.plus size={15} /> Create your first rule
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id} className={`transition-opacity ${rule.enabled ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-100">{rule.name}</h3>
                    <Badge color={rule.enabled ? 'green' : 'zinc'}>{rule.enabled ? 'enabled' : 'disabled'}</Badge>
                    <Badge color="blue">priority {rule.priority}</Badge>
                    <Badge>{matchLabel(rule.matchMode)}</Badge>
                    {rule.replyMode === 'all' && <Badge color="yellow">multi-reply</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {rule.keywords.map((k) => (
                      <span key={k} className="rounded-md border border-zinc-700/70 bg-zinc-800/70 px-2 py-0.5 text-xs text-zinc-300">
                        {k}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 space-y-0.5">
                    {rule.replies.map((r, i) => (
                      <p key={i} className="text-xs text-zinc-500">
                        <span className="text-zinc-600">{i + 1}.</span> {r.length > 110 ? r.slice(0, 110) + '…' : r}
                      </p>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-600">
                    {rule.cooldownSec > 0 && <span>Cooldown {rule.cooldownSec}s</span>}
                    {rule.delayMs > 0 && <span>Reply delay {rule.delayMs}ms</span>}
                    <span>{rule.accountIds.length ? `${rule.accountIds.length} account(s)` : 'all accounts'}</span>
                    <span>{rule.targetChats.length ? `${rule.targetChats.length} chat(s)` : 'all chats'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Toggle checked={rule.enabled} onChange={() => void toggle(rule)} label={`Toggle ${rule.name}`} />
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(rule); setEditorOpen(true) }}>
                    <Icons.edit size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(rule)}>
                    <Icons.trash size={14} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-zinc-800/70 bg-zinc-900/40">
        <p className="text-xs leading-relaxed text-zinc-500">
          <span className="font-medium text-zinc-400">Loop protection:</span> messages sent by this bot are never processed, per-chat auto-reply rates are capped (configurable in Settings), and cooldowns stop the same rule from firing repeatedly. Only the highest-priority matching rule fires per message.
          {accounts.length === 0 && ' Create an account first so rules can target it.'}
        </p>
      </Card>

      <RuleEditor open={editorOpen} onClose={() => setEditorOpen(false)} initial={editing} onSaved={() => void refreshRules()} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={busy}
        danger
        title="Delete rule?"
        message={`"${deleting?.name ?? ''}" will be permanently removed. Existing message history is kept.`}
        confirmLabel="Delete"
      />
    </div>
  )
}
