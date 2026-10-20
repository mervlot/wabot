import { logger } from '../logger.ts'
import { store } from '../store.ts'
import type { AIConfig } from '../types.ts'

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIResult {
  ok: boolean
  text?: string
  error?: string
  latencyMs: number
}

/**
 * Provider adapter. Each provider implements `complete`.
 * The OpenAI-compatible adapter also works with OpenRouter, Groq,
 * Together, LM Studio, Ollama (/v1), vLLM and any other service that
 * exposes an OpenAI-style /chat/completions endpoint.
 */
interface ProviderAdapter {
  id: string
  label: string
  defaultEndpoint: string
  complete(cfg: AIConfig, messages: AIMessage[]): Promise<string>
}

function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '••••'
  return key.slice(0, 4) + '…' + key.slice(-4)
}

const openaiAdapter: ProviderAdapter = {
  id: 'openai',
  label: 'OpenAI compatible',
  defaultEndpoint: 'https://api.openai.com/v1',
  async complete(cfg, messages) {
    const url = cfg.endpoint.replace(/\/+$/, '') + '/chat/completions'
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        max_tokens: cfg.maxTokens,
        temperature: cfg.temperature,
      }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`)
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = data.choices?.[0]?.message?.content
    if (typeof text !== 'string') throw new Error('Malformed response: no content')
    return text.trim()
  },
}

const anthropicAdapter: ProviderAdapter = {
  id: 'anthropic',
  label: 'Anthropic Claude',
  defaultEndpoint: 'https://api.anthropic.com/v1',
  async complete(cfg, messages) {
    const url = cfg.endpoint.replace(/\/+$/, '') + '/messages'
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
    const chat = messages.filter((m) => m.role !== 'system')
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        temperature: cfg.temperature,
        system: system || undefined,
        messages: chat,
      }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`)
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>
    }
    const text = data.content?.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
    if (!text) throw new Error('Malformed response: no content')
    return text.trim()
  },
}

const providers: Record<string, ProviderAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
}

export function listProviders(): Array<{ id: string; label: string; defaultEndpoint: string }> {
  return Object.values(providers).map((p) => ({ id: p.id, label: p.label, defaultEndpoint: p.defaultEndpoint }))
}

export const aiService = {
  getMaskedConfig() {
    const cfg = store.data.aiConfig
    return {
      provider: cfg.provider,
      endpoint: cfg.endpoint,
      apiKeyMasked: maskKey(cfg.apiKey),
      hasApiKey: Boolean(cfg.apiKey),
      model: cfg.model,
      systemPrompt: cfg.systemPrompt,
      maxTokens: cfg.maxTokens,
      temperature: cfg.temperature,
      enabled: cfg.enabled,
      groupEnabled: cfg.groupEnabled,
      groupJids: cfg.groupJids,
      fallbackReply: cfg.fallbackReply,
    }
  },

  async testConnection(): Promise<AIResult> {
    const cfg = store.data.aiConfig
    const start = Date.now()
    if (!cfg.apiKey) return { ok: false, error: 'No API key configured', latencyMs: 0 }
    if (!cfg.model) return { ok: false, error: 'No model configured', latencyMs: 0 }
    const adapter = providers[cfg.provider]
    if (!adapter) return { ok: false, error: `Unknown provider: ${cfg.provider}`, latencyMs: 0 }
    try {
      const text = await adapter.complete(cfg, [
        { role: 'system', content: 'Reply with exactly: OK' },
        { role: 'user', content: 'ping' },
      ])
      return { ok: true, text, latencyMs: Date.now() - start }
    } catch (err) {
      logger.warn('AI test failed', { err: String(err) })
      return { ok: false, error: String(err), latencyMs: Date.now() - start }
    }
  },

  /**
   * Generate a reply for an incoming WhatsApp message.
   * Returns null when AI is disabled or fails (caller falls back).
   */
  async generateReply(userText: string, chatName: string, isGroup: boolean): Promise<string | null> {
    const cfg = store.data.aiConfig
    if (!cfg.enabled) return null
    if (isGroup && !cfg.groupEnabled) return null
    if (!cfg.apiKey || !cfg.model) return null
    const adapter = providers[cfg.provider]
    if (!adapter) return null

    const messages: AIMessage[] = [
      { role: 'system', content: cfg.systemPrompt },
      {
        role: 'system',
        content: `Context: you are replying inside WhatsApp. The sender is in ${isGroup ? `the group "${chatName}"` : `a chat with ${chatName}`}. Keep the reply suitable for WhatsApp (no markdown headers, no code blocks unless asked).`,
      },
      { role: 'user', content: userText },
    ]

    try {
      const reply = await adapter.complete(cfg, messages)
      return reply || null
    } catch (err) {
      logger.error('AI generateReply failed', { err: String(err) })
      store.logError('ai', 'AI reply failed', String(err), null)
      return cfg.fallbackReply || null
    }
  },
}
