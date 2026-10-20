import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store.ts'
import { api } from '../lib/api.ts'
import { Card, CardTitle, Button, Badge, StatusDot, Icons, Spinner, EmptyState } from '../components/ui.tsx'

function StatCard({ label, value, sub, icon: Icon, accent }: { label: string; value: string | number; sub?: string; icon: typeof Icons.home; accent?: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
          <p className={`mt-2 text-2xl font-semibold ${accent || 'text-zinc-100'}`}>{value}</p>
          {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-2 text-zinc-400">
          <Icon size={18} />
        </div>
      </div>
    </Card>
  )
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export default function Overview() {
  const overview = useStore((s) => s.overview)
  const loading = useStore((s) => s.loading)
  const refresh = useStore((s) => s.refresh)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const doRefresh = async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  if (loading && !overview) {
    return (
      <div className="flex justify-center py-24 text-blue-500">
        <Spinner size={26} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Overview</h2>
          <p className="mt-1 text-sm text-zinc-500">Live snapshot of your automation setup.</p>
        </div>
        <Button size="sm" onClick={doRefresh} loading={refreshing}>
          <Icons.refresh size={14} /> Refresh
        </Button>
      </div>

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link to="/accounts" className="group">
          <Card className="flex items-center gap-3 transition-all hover:border-blue-700/60 hover:bg-zinc-900">
            <div className="rounded-lg bg-blue-600/15 p-2.5 text-blue-500 ring-1 ring-inset ring-blue-600/25">
              <Icons.qr size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200 group-hover:text-blue-300">Connect account</p>
              <p className="text-xs text-zinc-500">Scan a QR code</p>
            </div>
          </Card>
        </Link>
        <Link to="/rules" className="group">
          <Card className="flex items-center gap-3 transition-all hover:border-blue-700/60 hover:bg-zinc-900">
            <div className="rounded-lg bg-blue-600/15 p-2.5 text-blue-500 ring-1 ring-inset ring-blue-600/25">
              <Icons.plus size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200 group-hover:text-blue-300">Create rule</p>
              <p className="text-xs text-zinc-500">Keyword auto-reply</p>
            </div>
          </Card>
        </Link>
        <Link to="/messaging" className="group">
          <Card className="flex items-center gap-3 transition-all hover:border-blue-700/60 hover:bg-zinc-900">
            <div className="rounded-lg bg-blue-600/15 p-2.5 text-blue-500 ring-1 ring-inset ring-blue-600/25">
              <Icons.send size={18} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200 group-hover:text-blue-300">Compose message</p>
              <p className="text-xs text-zinc-500">Send manually</p>
            </div>
          </Card>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Connected accounts"
          value={`${overview?.accounts.connected ?? 0} / ${overview?.accounts.total ?? 0}`}
          sub={`${overview?.accounts.connecting ?? 0} connecting`}
          icon={Icons.phone}
          accent="text-emerald-400"
        />
        <StatCard
          label="Auto-reply rules"
          value={overview?.rules.total ?? 0}
          sub={`${overview?.rules.enabled ?? 0} enabled`}
          icon={Icons.rules}
        />
        <StatCard label="Messages sent today" value={overview?.messages.sentToday ?? 0} sub={`${overview?.messages.autoToday ?? 0} auto-replies`} icon={Icons.send} />
        <StatCard
          label="AI replies"
          value={overview?.aiEnabled ? 'Enabled' : 'Off'}
          sub="Keyword rules work without AI"
          icon={Icons.sparkle}
          accent={overview?.aiEnabled ? 'text-blue-400' : 'text-zinc-500'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Accounts status */}
        <Card pad={false}>
          <div className="px-5 pt-5">
            <CardTitle action={<Link to="/accounts" className="text-xs text-blue-500 hover:text-blue-400">Manage</Link>}>Accounts</CardTitle>
          </div>
          {overview?.accounts.detail.length ? (
            <ul className="divide-y divide-zinc-800/70">
              {overview.accounts.detail.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <StatusDot status={a.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-200">{a.name}</p>
                    <p className="truncate text-xs text-zinc-500">{a.pushName || a.jid || a.status}</p>
                  </div>
                  <Badge color={a.status === 'connected' ? 'green' : a.status === 'error' ? 'red' : a.status === 'disconnected' ? 'zinc' : 'yellow'}>
                    {a.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 pb-5">
              <EmptyState
                title="No accounts yet"
                subtitle="Create an account and scan the QR code to get started."
                action={
                  <Link to="/accounts">
                    <Button variant="primary" size="sm">
                      <Icons.plus size={14} /> Add account
                    </Button>
                  </Link>
                }
              />
            </div>
          )}
        </Card>

        {/* Recent activity */}
        <Card pad={false}>
          <div className="px-5 pt-5">
            <CardTitle action={<Link to="/history" className="text-xs text-blue-500 hover:text-blue-400">View history</Link>}>Recent activity</CardTitle>
          </div>
          {overview?.recentActivity.length ? (
            <ul className="max-h-72 divide-y divide-zinc-800/70 overflow-y-auto px-5 pb-4">
              {overview.recentActivity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-2.5">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                      a.type.includes('error') ? 'bg-red-500' : a.type.includes('connect') ? 'bg-emerald-500' : a.type.includes('reply') || a.type.includes('message') ? 'bg-blue-500' : 'bg-zinc-500'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-300">{a.message}</p>
                    <p className="text-[11px] text-zinc-600">{timeAgo(a.timestamp)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-5 text-sm text-zinc-600">No activity yet.</p>
          )}
        </Card>
      </div>

      {/* Recent errors */}
      {overview && overview.recentErrors.length > 0 && (
        <Card pad={false}>
          <div className="px-5 pt-5">
            <CardTitle
              action={
                <Button size="sm" variant="ghost" onClick={() => void api.clearErrors().then(() => refresh())}>
                  Clear
                </Button>
              }
            >
              Recent errors
            </CardTitle>
          </div>
          <ul className="divide-y divide-zinc-800/70 px-5 pb-4">
            {overview.recentErrors.map((e) => (
              <li key={e.id} className="py-2.5">
                <div className="flex items-center gap-2">
                  <Badge color="red">{e.source}</Badge>
                  <p className="truncate text-sm text-zinc-300">{e.message}</p>
                </div>
                {e.detail && <p className="mt-1 truncate text-xs text-zinc-600">{e.detail}</p>}
                <p className="mt-0.5 text-[11px] text-zinc-600">{timeAgo(e.timestamp)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
