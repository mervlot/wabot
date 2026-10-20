import { useEffect, useState, type FormEvent } from 'react'
import { useStore } from '../lib/store.ts'
import { api } from '../lib/api.ts'
import { Card, CardTitle, Button, Icons, Input, Select, Textarea, Toggle, Field, Badge, ConfirmDialog } from '../components/ui.tsx'
import type { AIProvider } from '../lib/types.ts'

export default function AIPage() {
  const aiConfig = useStore((s) => s.aiConfig)
  const refreshAi = useStore((s) => s.refreshAi)
  const toast = useStore((s) => s.toast)
  const accounts = useStore((s) => s.accounts)

  const [providers, setProviders] = useState<AIProvider[]>([])
  const [endpoint, setEndpoint] = useState('')
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [maxTokens, setMaxTokens] = useState(300)
  const [temperature, setTemperature] = useState(0.7)
  const [enabled, setEnabled] = useState(false)
  const [groupEnabled, setGroupEnabled] = useState(false)
  const [groupJids, setGroupJids] = useState('')
  const [fallbackReply, setFallbackReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text?: string; error?: string; latencyMs?: number } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    void api.aiProviders().then(setProviders).catch(() => {})
  }, [])

  useEffect(() => {
    if (!aiConfig) return
    setProvider(aiConfig.provider)
    setEndpoint(aiConfig.endpoint)
    setModel(aiConfig.model)
    setSystemPrompt(aiConfig.systemPrompt)
    setMaxTokens(aiConfig.maxTokens)
    setTemperature(aiConfig.temperature)
    setEnabled(aiConfig.enabled)
    setGroupEnabled(aiConfig.groupEnabled)
    setGroupJids(aiConfig.groupJids.join('\n'))
    setFallbackReply(aiConfig.fallbackReply)
    setApiKey('')
  }, [aiConfig])

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    try {
      await api.saveAiConfig({
        provider,
        endpoint,
        model,
        systemPrompt,
        maxTokens,
        temperature,
        enabled,
        groupEnabled,
        groupJids: groupJids.split('\n').map((s) => s.trim()).filter(Boolean),
        fallbackReply,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      })
      toast('success', 'AI configuration saved')
      await refreshAi()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      // save current values first so the test uses them
      await api.saveAiConfig({
        provider,
        endpoint,
        model,
        systemPrompt,
        maxTokens,
        temperature,
        enabled,
        groupEnabled,
        groupJids: groupJids.split('\n').map((s) => s.trim()).filter(Boolean),
        fallbackReply,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      })
      const r = await api.testAi()
      setTestResult(r)
      if (r.ok) toast('success', `Connection OK (${r.latencyMs}ms)`)
      else toast('error', r.error || 'Test failed')
      await refreshAi()
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.removeAiConfig()
      toast('success', 'API key removed')
      await refreshAi()
      setConfirmRemove(false)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setBusy(false)
    }
  }

  const toggleEnabled = async (v: boolean) => {
    setEnabled(v)
    try {
      await api.setAiEnabled(v, groupEnabled)
      await refreshAi()
      toast('success', v ? 'AI replies enabled' : 'AI replies disabled')
    } catch {
      setEnabled(!v)
      toast('error', 'Failed to update AI state')
    }
  }

  const selectedProvider = providers.find((p) => p.id === provider)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">AI Integration</h2>
          <p className="mt-1 text-sm text-zinc-500">Optional. Keyword auto-replies work without any AI provider.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge color={aiConfig?.enabled ? 'green' : 'zinc'}>{aiConfig?.enabled ? 'AI replies on' : 'AI replies off'}</Badge>
          <Toggle checked={enabled} onChange={(v) => void toggleEnabled(v)} label="Enable AI replies" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardTitle>Provider configuration</CardTitle>
            <form onSubmit={save} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Provider">
                  <Select
                    value={provider}
                    onChange={(e) => {
                      const p = e.target.value
                      setProvider(p)
                      const found = providers.find((x) => x.id === p)
                      if (found) setEndpoint(found.defaultEndpoint)
                    }}
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Model name">
                  <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini'} />
                </Field>
              </div>

              <Field label="API endpoint" hint="Any OpenAI-compatible endpoint works: OpenAI, OpenRouter, Groq, Ollama (http://localhost:11434/v1), LM Studio, etc.">
                <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder={selectedProvider?.defaultEndpoint} className="font-mono text-xs" />
              </Field>

              <Field label="API key" hint={aiConfig?.hasApiKey ? `Stored securely on the backend. Current: ${aiConfig.apiKeyMasked} — leave blank to keep it.` : 'Stored on the backend only — never sent to the browser.'}>
                <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={aiConfig?.hasApiKey ? '•••••••• (key saved — type to replace)' : 'sk-…'} autoComplete="new-password" />
              </Field>

              <Field label="System prompt">
                <Textarea rows={4} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} maxLength={8000} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`Max response length: ${maxTokens} tokens`}>
                  <input type="range" min={50} max={4000} step={50} value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} className="w-full accent-blue-600" />
                </Field>
                <Field label={`Temperature: ${temperature.toFixed(2)}`}>
                  <input type="range" min={0} max={2} step={0.05} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="w-full accent-blue-600" />
                </Field>
              </div>

              <Field label="Fallback reply (used if the AI call fails)" hint="Optional. Leave empty to skip replying on failure.">
                <Input value={fallbackReply} onChange={(e) => setFallbackReply(e.target.value)} placeholder="I'll get back to you shortly!" maxLength={1000} />
              </Field>

              <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800/80 pt-4">
                <Button type="button" variant="secondary" onClick={test} loading={testing} disabled={!model}>
                  <Icons.bolt size={14} /> Test connection
                </Button>
                <div className="flex-1" />
                <Button type="button" variant="ghost" onClick={() => setConfirmRemove(true)} disabled={!aiConfig?.hasApiKey}>
                  <Icons.trash size={14} /> Remove key
                </Button>
                <Button type="submit" variant="primary" loading={busy}>
                  Save configuration
                </Button>
              </div>

              {testResult && (
                <div className={`rounded-lg border px-3 py-2.5 text-xs ${testResult.ok ? 'border-emerald-900/60 bg-emerald-950/40 text-emerald-300' : 'border-red-900/60 bg-red-950/40 text-red-300'}`}>
                  <p className="font-medium">{testResult.ok ? `Connection successful (${testResult.latencyMs}ms)` : 'Connection failed'}</p>
                  <p className="mt-1 break-words opacity-80">{testResult.ok ? testResult.text : testResult.error}</p>
                </div>
              )}
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle>Group-specific settings</CardTitle>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5">
                <div>
                  <p className="text-sm text-zinc-300">AI in groups</p>
                  <p className="text-xs text-zinc-600">Respond to messages in groups</p>
                </div>
                <Toggle checked={groupEnabled} onChange={setGroupEnabled} label="AI in groups" />
              </div>
              <Field label="Restrict to groups (JIDs)" hint="Empty = all groups you're in. One JID per line.">
                <Textarea rows={4} value={groupJids} onChange={(e) => setGroupJids(e.target.value)} placeholder={"120363000000@g.us"} className="font-mono text-xs" />
              </Field>
              {accounts.length > 0 && (
                <p className="text-xs text-zinc-600">
                  AI settings apply to all connected accounts. Per-account AI routing is not yet supported — use keyword rules with account targeting for account-specific behaviour.
                </p>
              )}
            </div>
          </Card>

          <Card className="border-amber-900/40 bg-amber-950/10">
            <p className="text-xs leading-relaxed text-amber-200/80">
              <span className="font-medium text-amber-300">Privacy note:</span> API keys are stored in <code>data/store.json</code> on the server, returned to the browser only as a masked value, and never written to logs. When you save a reply, the triggering message text is sent to the configured AI endpoint — review your provider's data policy.
            </p>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={remove}
        loading={busy}
        danger
        title="Remove API key?"
        message="The stored key will be deleted and AI replies disabled. You can enter a new key at any time."
        confirmLabel="Remove key"
      />
    </div>
  )
}
