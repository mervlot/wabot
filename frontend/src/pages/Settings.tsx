import { useEffect, useState } from 'react'
import { useStore } from '../lib/store.ts'
import { api, getToken, setToken } from '../lib/api.ts'
import { Card, CardTitle, Button, Icons, Toggle, Field, Badge, ConfirmDialog, StatusDot } from '../components/ui.tsx'
import type { AppSettings } from '../lib/types.ts'

export default function SettingsPage() {
  const settings = useStore((s) => s.settings)
  const refreshSettings = useStore((s) => s.refreshSettings)
  const toast = useStore((s) => s.toast)
  const accounts = useStore((s) => s.accounts)

  const [draft, setDraft] = useState<AppSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmToken, setConfirmToken] = useState(false)
  const [newToken, setNewToken] = useState('')

  useEffect(() => {
    void refreshSettings()
  }, [refreshSettings])

  useEffect(() => {
    if (settings) setDraft({ ...settings })
  }, [settings])

  const save = async () => {
    if (!draft) return
    setBusy(true)
    try {
      await api.saveSettings(draft)
      toast('success', 'Settings saved')
      await refreshSettings()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const regenerate = async () => {
    setBusy(true)
    try {
      const { token } = await api.regenerateToken()
      setNewToken(token)
      setToken(token)
      setConfirmToken(false)
      toast('success', 'Token regenerated — use the new token next time you sign in')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to regenerate')
    } finally {
      setBusy(false)
    }
  }

  if (!draft) {
    return <div className="py-20 text-center text-sm text-zinc-600">Loading settings…</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Settings</h2>
          <p className="mt-1 text-sm text-zinc-500">Rate limits, safety protections and security.</p>
        </div>
        <Button variant="primary" onClick={save} loading={busy}>
          Save changes
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rate limits & safety */}
        <Card>
          <CardTitle>Rate limits & protection</CardTitle>
          <div className="space-y-5">
            <Field label={`Manual sends per minute per chat: ${draft.rateLimitPerMinute}`} hint="Applies to manual sends. Sequences are paced by their own delay setting.">
              <input type="range" min={1} max={60} value={draft.rateLimitPerMinute} onChange={(e) => setDraft({ ...draft, rateLimitPerMinute: Number(e.target.value) })} className="w-full accent-blue-600" />
            </Field>
            <Field label={`Auto-replies per minute per chat: ${draft.maxAutoRepliesPerChatPerMin}`} hint="Core loop/spam protection — caps how often rules + AI may reply to the same chat.">
              <input type="range" min={1} max={30} value={draft.maxAutoRepliesPerChatPerMin} onChange={(e) => setDraft({ ...draft, maxAutoRepliesPerChatPerMin: Number(e.target.value) })} className="w-full accent-blue-600" />
            </Field>
            <div className="space-y-2.5">
              <SettingToggle label="Auto-reconnect" desc="Reconnect automatically after network drops" checked={draft.autoReconnect} onChange={(v) => setDraft({ ...draft, autoReconnect: v })} />
              <SettingToggle label="Reply in groups" desc="Allow keyword rules to trigger in group chats" checked={draft.replyToGroups} onChange={(v) => setDraft({ ...draft, replyToGroups: v })} />
              <SettingToggle label="Reply to individuals" desc="Allow keyword rules in 1:1 chats" checked={draft.replyToIndividuals} onChange={(v) => setDraft({ ...draft, replyToIndividuals: v })} />
              <SettingToggle label="Log incoming messages" desc="Store received messages for history (may contain personal data)" checked={draft.logIncoming} onChange={(v) => setDraft({ ...draft, logIncoming: v })} />
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          {/* Security */}
          <Card>
            <CardTitle>Security</CardTitle>
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">API token (current session)</p>
                <p className="mt-1.5 font-mono text-xs text-zinc-300">{getToken().slice(0, 12)}…{getToken().slice(-4)}</p>
                <p className="mt-2 text-xs text-zinc-600">Stored in sessionStorage — cleared when the tab closes. The server rejects any request without the full token.</p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setConfirmToken(true)}>
                <Icons.refresh size={14} /> Regenerate API token
              </Button>
              {newToken && (
                <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 p-3">
                  <p className="text-xs font-medium text-amber-300">New token (save it now, it won't be shown again):</p>
                  <code className="mt-1 block break-all text-xs text-amber-200">{newToken}</code>
                  <p className="mt-1 text-[11px] text-amber-400/60">You are signed in with it already.</p>
                </div>
              )}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-500">
                <p className="font-medium text-zinc-400">Network binding</p>
                <p className="mt-1">
                  The server listens on <code className="text-zinc-400">127.0.0.1:3456</code> by default — reachable only from this device. To change it, set <code className="text-zinc-400">HOST</code> in <code className="text-zinc-400">backend/.env</code> and restart. Only expose it to your LAN if you understand the risks (the API token is the only gate).
                </p>
              </div>
            </div>
          </Card>

          {/* Accounts overview */}
          <Card>
            <CardTitle>Linked accounts</CardTitle>
            {accounts.length === 0 ? (
              <p className="text-sm text-zinc-600">No accounts yet.</p>
            ) : (
              <ul className="space-y-2">
                {accounts.map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                    <StatusDot status={a.status} />
                    <span className="flex-1 truncate text-sm text-zinc-300">{a.name}</span>
                    <Badge color={a.status === 'connected' ? 'green' : 'zinc'}>{a.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmToken}
        onClose={() => setConfirmToken(false)}
        onConfirm={regenerate}
        loading={busy}
        danger
        title="Regenerate API token?"
        message="All existing sessions (this browser included) will be signed out immediately after the new token is issued. You'll need to paste the new token to sign back in."
        confirmLabel="Regenerate"
      />
    </div>
  )
}

function SettingToggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-zinc-300">{label}</p>
        <p className="text-xs text-zinc-600">{desc}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  )
}
