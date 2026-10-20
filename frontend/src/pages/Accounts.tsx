import { useEffect, useState, type FormEvent } from 'react'
import { useStore } from '../lib/store.ts'
import { api } from '../lib/api.ts'
import { Card, Button, Badge, StatusDot, Icons, Modal, Input, EmptyState, ConfirmDialog, Spinner, Field } from '../components/ui.tsx'
import type { Account } from '../lib/types.ts'

function AccountCard({ account }: { account: Account }) {
  const toast = useStore((s) => s.toast)
  const refresh = useStore((s) => s.refresh)
  const refreshAccounts = useStore((s) => s.refreshAccounts)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [showPair, setShowPair] = useState(false)
  const [phone, setPhone] = useState('')
  const [pairError, setPairError] = useState('')

  useEffect(() => {
    if (account.status === 'qr' && account.qr) setShowQr(true)
  }, [account.status, account.qr])

  useEffect(() => {
    if (account.status === 'pairing') setShowPair(true)
  }, [account.status])

  const connect = async () => {
    setBusy(true)
    try {
      await api.connectAccount(account.id)
      await refreshAccounts()
      toast('info', 'Waiting for QR scan…')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setBusy(false)
    }
  }

  const pair = async () => {
    if (!phone.trim()) return
    setBusy(true)
    setPairError('')
    try {
      await api.pairAccount(account.id, phone.trim())
      await refreshAccounts()
      toast('info', 'Generating pairing code…')
    } catch (err) {
      setPairError(err instanceof Error ? err.message : 'Failed to request pairing code')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    try {
      await api.disconnectAccount(account.id)
      await refresh()
      toast('success', 'Disconnected')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.deleteAccount(account.id)
      await refresh()
      toast('success', 'Account removed')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to remove')
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  const statusColor = account.status === 'connected' ? 'green' : account.status === 'error' ? 'red' : account.status === 'disconnected' ? 'zinc' : 'yellow'

  return (
    <>
      <Card className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-sm font-semibold text-zinc-300">
              {account.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-zinc-100">{account.name}</p>
              <p className="truncate text-xs text-zinc-500">{account.pushName || account.jid || 'Not linked'}</p>
            </div>
          </div>
          <Badge color={statusColor}>
            <StatusDot status={account.status} />
            {account.status}
          </Badge>
        </div>

        {account.status === 'error' && account.lastError && (
          <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-400">{account.lastError}</p>
        )}

        <div className="flex flex-wrap gap-2">
          {account.status === 'connected' ? (
            <Button size="sm" variant="danger" onClick={disconnect} loading={busy}>
              <Icons.unplug size={14} /> Disconnect
            </Button>
          ) : (
            <>
              <Button size="sm" variant="primary" onClick={connect} loading={busy} disabled={account.status === 'connecting'}>
                <Icons.qr size={14} /> {account.status === 'connecting' ? 'Connecting…' : account.status === 'qr' ? 'Show QR' : 'Connect via QR'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { setPairError(''); setShowPair(true) }} disabled={busy || account.status === 'connecting'}>
                <Icons.phone size={14} /> Use phone number
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} disabled={busy}>
            <Icons.trash size={14} /> Remove
          </Button>
        </div>
      </Card>

      {/* QR modal */}
      <Modal open={showQr && account.status === 'qr'} onClose={() => setShowQr(false)} title={`Scan QR — ${account.name}`}>
        <div className="flex flex-col items-center gap-4 py-2">
          {account.qr ? (
            <div className="rounded-xl border border-zinc-700 bg-white p-3">
              <img src={account.qr} alt="WhatsApp QR code" className="h-64 w-64" />
            </div>
          ) : (
            <div className="flex h-64 w-64 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-500">
              <Spinner size={26} />
            </div>
          )}
          <div className="text-center text-sm text-zinc-400">
            <p>
              Open WhatsApp → <span className="text-zinc-200">Linked devices</span> → <span className="text-zinc-200">Link a device</span>
            </p>
            <p className="mt-1 text-xs text-zinc-600">QR refreshes automatically. Keep this window open.</p>
          </div>
        </div>
      </Modal>

      {/* Pairing-code modal */}
      <Modal
        open={showPair}
        onClose={() => {
          setShowPair(false)
          if (account.status === 'pairing') void disconnect()
        }}
        title={`Link with phone number — ${account.name}`}
      >
        <div className="space-y-4">
          {account.status !== 'pairing' ? (
            <>
              <p className="text-sm text-zinc-400">
                Enter the WhatsApp phone number for this account, including the country code. WhatsApp will show an 8-digit code you type into the app — no camera needed.
              </p>
              <Field label="Phone number" hint="Digits and country code only, e.g. 2348012345678 (no leading +).">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="2348012345678"
                  inputMode="tel"
                  autoFocus
                  disabled={busy}
                />
              </Field>
              {pairError && <p className="text-xs text-red-400">{pairError}</p>}
              <div className="flex justify-end gap-2">
                <Button onClick={() => setShowPair(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={pair} loading={busy} disabled={!phone.trim()}>
                  Get pairing code
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3 rounded-xl border border-blue-900/50 bg-blue-950/20 py-6">
                <p className="text-xs uppercase tracking-wider text-zinc-500">Your pairing code</p>
                <p className="font-mono text-3xl font-bold tracking-widest text-blue-300">{account.pairingCode || '••••-••••'}</p>
              </div>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-zinc-400">
                <li>Open WhatsApp on the phone with <span className="text-zinc-200">+{account.pairingPhone}</span>.</li>
                <li>Go to <span className="text-zinc-200">Settings → Linked devices → Link a device</span>.</li>
                <li>Tap <span className="text-zinc-200">Link with phone number instead</span>.</li>
                <li>Enter the code above.</li>
              </ol>
              <p className="text-xs text-zinc-600">This code expires shortly. If it fails, close this and request a new one.</p>
              <div className="flex justify-end">
                <Button onClick={() => setShowPair(false)}>Close</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={busy}
        danger
        title="Remove account?"
        message={`This disconnects "${account.name}" and permanently deletes its saved session. You will need to link it again (QR or phone number) to reconnect.`}
        confirmLabel="Remove"
      />
    </>
  )
}

export default function Accounts() {
  const accounts = useStore((s) => s.accounts)
  const refresh = useStore((s) => s.refresh)
  const toast = useStore((s) => s.toast)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError('')
    try {
      const account = await api.createAccount(name.trim())
      toast('success', `Account "${account.name}" created`)
      setName('')
      setOpen(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">WhatsApp Accounts</h2>
          <p className="mt-1 text-sm text-zinc-500">Connect and manage multiple accounts. Sessions are stored server-side only.</p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Icons.plus size={15} /> New account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Icons.phone size={36} />}
          title="No accounts configured"
          subtitle="Create an account, then link it by scanning a QR code or entering a pairing code sent to your phone number."
          action={
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Icons.plus size={15} /> Create your first account
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} />
          ))}
        </div>
      )}

      <Card className="border-zinc-800/70 bg-zinc-900/40">
        <p className="text-xs leading-relaxed text-zinc-500">
          <span className="font-medium text-zinc-400">About sessions:</span> auth files live in <code className="text-zinc-400">data/sessions/&lt;account-id&gt;</code> on the server and are never sent to the browser. Removing an account deletes its session directory. Baileys is an unofficial library — linking multiple accounts increases the risk of WhatsApp restrictions; use accounts you own and behave like a normal user.
        </p>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New WhatsApp account">
        <form onSubmit={create} className="space-y-4">
          <Field label="Account name" hint="Shown across the dashboard, e.g. Personal or Business.">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Personal" maxLength={60} autoFocus />
          </Field>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
