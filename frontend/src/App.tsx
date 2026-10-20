import { useEffect, useState, type FormEvent } from 'react'
import { useStore, initRealtime } from './lib/store.ts'
import { Layout } from './components/Layout.tsx'
import { Button, Input, Spinner, Card } from './components/ui.tsx'
import { getToken } from './lib/api.ts'
import Overview from './pages/Overview.tsx'
import Accounts from './pages/Accounts.tsx'
import Messaging from './pages/Messaging.tsx'
import Rules from './pages/Rules.tsx'
import AIPage from './pages/AI.tsx'
import History from './pages/History.tsx'
import SettingsPage from './pages/Settings.tsx'
import { Routes, Route, Navigate } from 'react-router-dom'

function LoginScreen() {
  const login = useStore((s) => s.login)
  const toast = useStore((s) => s.toast)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!token.trim()) return
    setBusy(true)
    setError('')
    try {
      await login(token.trim())
      toast('success', 'Signed in')
    } catch {
      setError('Invalid token. Check the backend console output or data/store.json.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-md animate-slide-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white shadow-md shadow-blue-900/40">W</div>
          <h1 className="text-lg font-semibold text-zinc-100">WA Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">Enter the API token printed by the backend on first start.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">API Token</label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="paste token…"
              autoFocus
              autoComplete="off"
            />
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          </div>
          <Button type="submit" variant="primary" loading={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs leading-relaxed text-zinc-600">
          The backend binds to 127.0.0.1 only.
          <br />
          Find the token in <code className="text-zinc-500">data/store.json</code> → <code className="text-zinc-500">apiToken</code>
        </p>
      </Card>
    </div>
  )
}

export default function App() {
  const authed = useStore((s) => s.authed)
  const loading = useStore((s) => s.loading)
  const bootstrap = useStore((s) => s.bootstrap)

  useEffect(() => {
    initRealtime()
    if (getToken()) void bootstrap()
  }, [bootstrap])

  if (!authed) return <LoginScreen />

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-blue-500">
        <Spinner size={28} />
      </div>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/messaging" element={<Messaging />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/ai" element={<AIPage />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
