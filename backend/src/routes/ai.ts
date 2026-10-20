import { Router } from 'express'
import { requireAuth } from '../auth.ts'
import { store } from '../store.ts'
import { aiService, listProviders } from '../services/ai.ts'
import { broadcast } from '../ws.ts'
import type { AIConfig } from '../types.ts'

export const aiRouter = Router()
aiRouter.use(requireAuth)

aiRouter.get('/providers', (_req, res) => {
  res.json(listProviders())
})

aiRouter.get('/config', (_req, res) => {
  res.json(aiService.getMaskedConfig())
})

aiRouter.put('/config', (req, res) => {
  const b = (req.body || {}) as Record<string, unknown>
  const cfg: AIConfig = { ...store.data.aiConfig }
  if (typeof b.provider === 'string' && ['openai', 'anthropic'].includes(b.provider)) cfg.provider = b.provider as AIConfig['provider']
  if (typeof b.endpoint === 'string' && b.endpoint.trim()) cfg.endpoint = b.endpoint.trim()
  if (typeof b.apiKey === 'string') {
    const key = b.apiKey.trim()
    // ignore masked placeholder values sent back by the frontend
    if (key && !key.includes('…')) cfg.apiKey = key
  }
  if (typeof b.model === 'string') cfg.model = b.model.trim()
  if (typeof b.systemPrompt === 'string') cfg.systemPrompt = b.systemPrompt.slice(0, 8000)
  if (b.maxTokens !== undefined) cfg.maxTokens = Math.max(1, Math.min(Number(b.maxTokens) || 300, 8000))
  if (b.temperature !== undefined) cfg.temperature = Math.max(0, Math.min(Number(b.temperature) || 0, 2))
  if (typeof b.enabled === 'boolean') cfg.enabled = b.enabled
  if (typeof b.groupEnabled === 'boolean') cfg.groupEnabled = b.groupEnabled
  if (Array.isArray(b.groupJids)) cfg.groupJids = b.groupJids.map(String)
  if (typeof b.fallbackReply === 'string') cfg.fallbackReply = b.fallbackReply.slice(0, 1000)
  store.data.aiConfig = cfg
  store.saveNow()
  store.logActivity('ai_configured', `AI config updated (provider: ${cfg.provider}${cfg.enabled ? ', enabled' : ''})`, null)
  broadcast({ type: 'ai_config_changed' })
  res.json(aiService.getMaskedConfig())
})

aiRouter.delete('/config', (_req, res) => {
  const cfg = store.data.aiConfig
  cfg.apiKey = ''
  cfg.enabled = false
  store.data.aiConfig = cfg
  store.saveNow()
  broadcast({ type: 'ai_config_changed' })
  res.json(aiService.getMaskedConfig())
})

aiRouter.post('/test', async (_req, res) => {
  const result = await aiService.testConnection()
  res.json(result)
})

aiRouter.put('/enable', (req, res) => {
  const enabled = Boolean(req.body?.enabled)
  store.data.aiConfig.enabled = enabled
  if (req.body?.groupEnabled !== undefined) store.data.aiConfig.groupEnabled = Boolean(req.body.groupEnabled)
  store.saveNow()
  broadcast({ type: 'ai_config_changed' })
  res.json(aiService.getMaskedConfig())
})
