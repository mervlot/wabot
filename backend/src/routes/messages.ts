import { Router } from 'express'
import { requireAuth } from '../auth.ts'
import { store } from '../store.ts'
import { sender } from '../services/sender.ts'
import { waManager } from '../wa/manager.ts'

export const messagesRouter = Router()
messagesRouter.use(requireAuth)

messagesRouter.post('/send', async (req, res) => {
  const accountId = String(req.body?.accountId || '')
  const jid = String(req.body?.jid || '').trim()
  const text = String(req.body?.text || '')
  if (!accountId || !store.getAccount(accountId)) {
    res.status(400).json({ error: 'Valid accountId required' })
    return
  }
  if (!jid || !jid.includes('@')) {
    res.status(400).json({ error: 'Valid jid required' })
    return
  }
  if (!text.trim() || text.length > 6000) {
    res.status(400).json({ error: 'Message text required (max 6000 chars)' })
    return
  }
  if (!waManager.isConnected(accountId)) {
    res.status(409).json({ error: 'Account is not connected' })
    return
  }
  const result = await sender.sendSingle(accountId, jid, text)
  if (result.ok) res.json(result)
  else res.status(422).json({ error: result.error })
})

messagesRouter.post('/sequence', (req, res) => {
  const accountId = String(req.body?.accountId || '')
  const jid = String(req.body?.jid || '').trim()
  const messages: unknown = req.body?.messages
  const delayMs = Number(req.body?.delayMs ?? 2000)
  const confirmed = Boolean(req.body?.confirmed)

  if (!accountId || !store.getAccount(accountId)) {
    res.status(400).json({ error: 'Valid accountId required' })
    return
  }
  if (!jid || !jid.includes('@')) {
    res.status(400).json({ error: 'Valid jid required' })
    return
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
    res.status(400).json({ error: 'Provide 1-50 messages' })
    return
  }
  const texts = messages.map((m) => String(m))
  if (texts.some((t) => !t.trim() || t.length > 6000)) {
    res.status(400).json({ error: 'Each message must be 1-6000 chars' })
    return
  }
  if (!waManager.isConnected(accountId)) {
    res.status(409).json({ error: 'Account is not connected' })
    return
  }
  if (texts.length > 1 && !confirmed) {
    res.status(428).json({ error: 'Confirmation required for multi-message send', needsConfirm: true })
    return
  }
  if (!Number.isFinite(delayMs) || delayMs < 500 || delayMs > 120_000) {
    res.status(400).json({ error: 'delayMs must be 500-120000' })
    return
  }
  const job = sender.startSequence(accountId, jid, texts, delayMs)
  res.status(201).json(job)
})

messagesRouter.post('/sequence/:id/cancel', (req, res) => {
  const ok = sender.cancelSequence(req.params.id)
  if (ok) res.json({ ok: true })
  else res.status(409).json({ error: 'Sequence not found or not running' })
})

messagesRouter.get('/sequences', (req, res) => {
  const accountId = req.query.accountId as string | undefined
  res.json(sender.listSequences(accountId))
})

messagesRouter.get('/history', (req, res) => {
  const accountId = req.query.accountId as string | undefined
  const chatJid = req.query.chatJid as string | undefined
  const direction = req.query.direction as string | undefined
  const limit = Math.min(Number(req.query.limit ?? 200), 1000)
  res.json(store.getMessages({ accountId, chatJid, direction, limit }))
})
