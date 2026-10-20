import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { waManager } from '../wa/manager.ts'
import { store } from '../store.ts'
import { requireAuth } from '../auth.ts'
import { autoReplyEngine } from '../services/auto-reply.ts'
import type { Account } from '../types.ts'

export const accountsRouter = Router()
accountsRouter.use(requireAuth)

accountsRouter.get('/', (_req, res) => {
  res.json(
    store.data.accounts.map((a) => ({
      ...a,
      qr: a.status === 'qr' ? a.qr : null,
      pairingCode: a.status === 'pairing' ? a.pairingCode : null,
    })),
  )
})

accountsRouter.post('/', (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name || name.length > 60) {
    res.status(400).json({ error: 'Name required (1-60 chars)' })
    return
  }
  const account: Account = {
    id: randomUUID(),
    name,
    status: 'disconnected',
    jid: null,
    pushName: null,
    qr: null,
    pairingCode: null,
    pairingPhone: null,
    lastError: null,
    createdAt: Date.now(),
    connectedAt: null,
  }
  store.saveAccount(account)
  store.logActivity('account_created', `Account "${name}" created`, account.id)
  res.status(201).json(account)
})

accountsRouter.get('/:id', (req, res) => {
  const account = store.getAccount(req.params.id)
  if (!account) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json({
    ...account,
    qr: account.status === 'qr' ? account.qr : null,
    pairingCode: account.status === 'pairing' ? account.pairingCode : null,
  })
})

accountsRouter.post('/:id/connect', async (req, res) => {
  const account = store.getAccount(req.params.id)
  if (!account) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  try {
    await waManager.connect(account.id)
    autoReplyEngine.attach(account.id)
    res.json({ ok: true, status: store.getAccount(account.id)?.status })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

accountsRouter.post('/:id/pair', async (req, res) => {
  const account = store.getAccount(req.params.id)
  if (!account) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const phone = String(req.body?.phone || '').trim()
  if (!phone) {
    res.status(400).json({ error: 'Phone number required' })
    return
  }
  try {
    await waManager.pairWithPhone(account.id, phone)
    autoReplyEngine.attach(account.id)
    res.json({ ok: true, status: store.getAccount(account.id)?.status })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

accountsRouter.post('/:id/disconnect', async (req, res) => {
  const account = store.getAccount(req.params.id)
  if (!account) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  autoReplyEngine.detach(account.id)
  await waManager.disconnect(account.id)
  res.json({ ok: true })
})

accountsRouter.delete('/:id', async (req, res) => {
  const account = store.getAccount(req.params.id)
  if (!account) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  autoReplyEngine.detach(account.id)
  await waManager.removeAccount(account.id)
  res.json({ ok: true })
})

accountsRouter.get('/:id/chats', async (req, res) => {
  const account = store.getAccount(req.params.id)
  if (!account) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  try {
    const chats = await waManager.getChats(account.id)
    res.json(chats)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})
