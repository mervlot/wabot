import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { requireAuth, validateToken } from '../auth.ts'
import { store } from '../store.ts'
import { waManager } from '../wa/manager.ts'
import { broadcast } from '../ws.ts'
import type { AppSettings } from '../types.ts'

export const systemRouter = Router()

systemRouter.post('/login', (req, res) => {
  const token = String(req.body?.token || '')
  if (validateToken(token)) {
    res.json({ ok: true })
  } else {
    res.status(401).json({ error: 'Invalid token' })
  }
})

systemRouter.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime(), accounts: store.data.accounts.length })
})

systemRouter.get('/overview', requireAuth, (_req, res) => {
  const accounts = store.data.accounts
  const connected = accounts.filter((a) => a.status === 'connected').length
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const messages = store.getMessages({ limit: config_maxMessages() })
  const sentToday = messages.filter((m) => m.direction !== 'in' && m.timestamp >= dayStart.getTime()).length
  const autoToday = messages.filter((m) => m.direction === 'auto' && m.timestamp >= dayStart.getTime()).length
  res.json({
    accounts: {
      total: accounts.length,
      connected,
      connecting: accounts.filter((a) => a.status === 'connecting' || a.status === 'qr').length,
      detail: accounts.map((a) => ({ id: a.id, name: a.name, status: a.status, jid: a.jid, pushName: a.pushName })),
    },
    rules: {
      total: store.data.rules.length,
      enabled: store.data.rules.filter((r) => r.enabled).length,
    },
    messages: {
      sentToday,
      autoToday,
      total: messages.length,
    },
    aiEnabled: store.data.aiConfig.enabled,
    recentActivity: store.data.activity.slice(-12).reverse(),
    recentErrors: store.data.errors.slice(-8).reverse(),
  })
})

function config_maxMessages(): number {
  return 5000
}

systemRouter.get('/activity', requireAuth, (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 500)
  res.json(store.data.activity.slice(-limit).reverse())
})

systemRouter.get('/errors', requireAuth, (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200)
  res.json(store.data.errors.slice(-limit).reverse())
})

systemRouter.delete('/errors', requireAuth, (_req, res) => {
  store.data.errors = []
  store.scheduleSave()
  res.json({ ok: true })
})

systemRouter.get('/settings', requireAuth, (_req, res) => {
  res.json(store.data.settings)
})

systemRouter.put('/settings', requireAuth, (req, res) => {
  const b = (req.body || {}) as Partial<AppSettings>
  const s = store.data.settings
  if (b.rateLimitPerMinute !== undefined) s.rateLimitPerMinute = Math.max(1, Math.min(Number(b.rateLimitPerMinute) || 15, 120))
  if (b.autoReconnect !== undefined) s.autoReconnect = Boolean(b.autoReconnect)
  if (b.replyToGroups !== undefined) s.replyToGroups = Boolean(b.replyToGroups)
  if (b.replyToIndividuals !== undefined) s.replyToIndividuals = Boolean(b.replyToIndividuals)
  if (b.maxAutoRepliesPerChatPerMin !== undefined) s.maxAutoRepliesPerChatPerMin = Math.max(1, Math.min(Number(b.maxAutoRepliesPerChatPerMin) || 5, 60))
  if (b.logIncoming !== undefined) s.logIncoming = Boolean(b.logIncoming)
  store.data.settings = s
  store.saveNow()
  store.logActivity('settings_updated', 'Settings updated', null)
  broadcast({ type: 'settings_changed' })
  res.json(s)
})

systemRouter.post('/settings/regenerate-token', requireAuth, (_req, res) => {
  const token = randomBytes(24).toString('hex')
  store.data.apiToken = token
  store.saveNow()
  res.json({ token })
})
