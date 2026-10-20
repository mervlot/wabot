import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store.ts'
import { api } from '../lib/api.ts'
import { Card, Button, Badge, Icons, Input, Select, Spinner, EmptyState, Field } from '../components/ui.tsx'
import type { ActivityRecord, ErrorRecord } from '../lib/types.ts'

type Tab = 'messages' | 'activity' | 'errors'

function fmt(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function History() {
  const history = useStore((s) => s.history)
  const activity = useStore((s) => s.activity)
  const errors = useStore((s) => s.errors)
  const accounts = useStore((s) => s.accounts)
  const refreshHistory = useStore((s) => s.refreshHistory)
  const refresh = useStore((s) => s.refresh)
  const toast = useStore((s) => s.toast)

  const [tab, setTab] = useState<Tab>('messages')
  const [direction, setDirection] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    refreshHistory(accountFilter ? { accountId: accountFilter, direction: direction || undefined } : direction ? { direction } : {})
      .finally(() => setLoading(false))
  }, [refreshHistory, accountFilter, direction])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return history
    return history.filter((m) => m.text.toLowerCase().includes(q) || m.chatName.toLowerCase().includes(q) || m.chatJid.toLowerCase().includes(q))
  }, [history, search])

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name || id.slice(0, 8)

  const clearErrors = async () => {
    try {
      await api.clearErrors()
      await refresh()
      toast('success', 'Errors cleared')
    } catch {
      toast('error', 'Failed to clear errors')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Message History</h2>
          <p className="mt-1 text-sm text-zinc-500">Sent, received and auto-reply messages with delivery status.</p>
        </div>
        <Button size="sm" onClick={() => void refresh()} variant="ghost">
          <Icons.refresh size={14} /> Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
        {(
          [
            ['messages', 'Messages'],
            ['activity', 'Activity'],
            ['errors', `Errors${errors.length ? ` (${errors.length})` : ''}`],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === id ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'messages' && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Direction">
              <Select value={direction} onChange={(e) => setDirection(e.target.value)}>
                <option value="">All</option>
                <option value="out">Sent (manual)</option>
                <option value="auto">Auto-reply / AI</option>
                <option value="in">Incoming</option>
              </Select>
            </Field>
            <Field label="Account">
              <Select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Search text">
              <div className="relative">
                <Icons.search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search messages…" className="pl-8" />
              </div>
            </Field>
          </div>

          {loading ? (
            <div className="flex justify-center py-16 text-blue-500">
              <Spinner size={24} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<Icons.clock size={32} />} title="No messages yet" subtitle="Enable 'Log incoming messages' in Settings to capture inbound chats, or send a message from the Messaging page." />
          ) : (
            <Card pad={false} className="divide-y divide-zinc-800/60">
              {filtered.map((m) => (
                <div key={m.id} className="flex items-start gap-3 px-4 py-3">
                  <div className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${m.direction === 'in' ? 'bg-zinc-800 text-zinc-400' : m.direction === 'auto' ? 'bg-blue-600/20 text-blue-400' : 'bg-emerald-600/20 text-emerald-400'}`}>
                    {m.direction === 'in' ? 'IN' : m.direction === 'auto' ? 'AI' : 'OUT'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200">{m.chatName}</span>
                      <Badge>{accountName(m.accountId)}</Badge>
                      <Badge color={m.status === 'error' ? 'red' : m.status === 'read' ? 'green' : m.status === 'delivered' ? 'blue' : 'zinc'}>{m.status}</Badge>
                      {m.ruleId && <Badge color="yellow">rule</Badge>}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-400">{m.text}</p>
                    {m.error && <p className="mt-1 text-xs text-red-400">{m.error}</p>}
                    <p className="mt-1 text-[11px] text-zinc-600">{fmt(m.timestamp)}</p>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {tab === 'activity' && (
        <Card pad={false} className="divide-y divide-zinc-800/60">
          {activity.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-zinc-600">No activity recorded yet.</p>
          ) : (
            activity.map((a: ActivityRecord) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <Badge
                  color={
                    a.type.includes('connect') ? 'green' : a.type.includes('error') ? 'red' : a.type.includes('reply') || a.type.includes('message') ? 'blue' : 'zinc'
                  }
                >
                  {a.type.replace(/_/g, ' ')}
                </Badge>
                <p className="min-w-0 flex-1 truncate text-sm text-zinc-300">{a.message}</p>
                <span className="flex-shrink-0 text-[11px] text-zinc-600">{fmt(a.timestamp)}</span>
              </div>
            ))
          )}
        </Card>
      )}

      {tab === 'errors' && (
        <>
          {errors.length > 0 && (
            <div className="flex justify-end">
              <Button size="sm" variant="danger" onClick={clearErrors}>
                <Icons.trash size={13} /> Clear all
              </Button>
            </div>
          )}
          <Card pad={false} className="divide-y divide-zinc-800/60">
            {errors.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-zinc-600">No errors. Nice.</p>
            ) : (
              errors.map((e: ErrorRecord) => (
                <div key={e.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge color="red">{e.source}</Badge>
                    <p className="text-sm text-zinc-200">{e.message}</p>
                    <span className="ml-auto text-[11px] text-zinc-600">{fmt(e.timestamp)}</span>
                  </div>
                  {e.detail && <p className="mt-1 break-words text-xs text-zinc-500">{e.detail}</p>}
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  )
}
