import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { requireAuth } from '../auth.ts'
import { store } from '../store.ts'
import { broadcast } from '../ws.ts'
import type { AutoReplyRule, MatchMode } from '../types.ts'

export const rulesRouter = Router()
rulesRouter.use(requireAuth)

const VALID_MODES: MatchMode[] = ['exact', 'contains', 'ci']

function validate(body: unknown): { ok: true; value: Partial<AutoReplyRule> } | { ok: false; error: string } {
  const b = (body || {}) as Record<string, unknown>
  const name = String(b.name ?? '').trim()
  if (!name || name.length > 80) return { ok: false, error: 'Name required (1-80 chars)' }
  const keywords = Array.isArray(b.keywords) ? b.keywords.map((k) => String(k).trim()).filter(Boolean) : []
  if (keywords.length === 0 || keywords.length > 50) return { ok: false, error: '1-50 keywords required' }
  const replies = Array.isArray(b.replies) ? b.replies.map((r) => String(r)).filter((r) => r.trim()) : []
  if (replies.length === 0 || replies.length > 20) return { ok: false, error: '1-20 replies required' }
  const matchMode = String(b.matchMode ?? 'ci') as MatchMode
  if (!VALID_MODES.includes(matchMode)) return { ok: false, error: 'matchMode must be exact|contains|ci' }
  const replyMode = String(b.replyMode ?? 'one') === 'all' ? 'all' : 'one'
  const delayMs = Math.max(0, Math.min(Number(b.delayMs ?? 0), 120_000))
  const cooldownSec = Math.max(0, Math.min(Number(b.cooldownSec ?? 0), 86_400))
  const priority = Math.max(1, Math.min(Number(b.priority ?? 10), 1000))
  const accountIds = Array.isArray(b.accountIds) ? b.accountIds.map(String) : []
  const targetChats = Array.isArray(b.targetChats) ? b.targetChats.map(String) : []
  const enabled = b.enabled !== false
  return {
    ok: true,
    value: { name, keywords, replies, matchMode, replyMode, delayMs, cooldownSec, priority, accountIds, targetChats, enabled },
  }
}

rulesRouter.get('/', (_req, res) => {
  res.json([...store.data.rules].sort((a, b) => a.priority - b.priority))
})

rulesRouter.post('/', (req, res) => {
  const v = validate(req.body)
  if (!v.ok) {
    res.status(400).json({ error: v.error })
    return
  }
  const rule: AutoReplyRule = {
    id: randomUUID(),
    ...v.value,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as AutoReplyRule
  store.saveRule(rule)
  store.logActivity('rule_created', `Rule "${rule.name}" created`, null)
  broadcast({ type: 'rule_changed', action: 'created', rule })
  res.status(201).json(rule)
})

rulesRouter.put('/:id', (req, res) => {
  const existing = store.getRule(req.params.id)
  if (!existing) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const v = validate(req.body)
  if (!v.ok) {
    res.status(400).json({ error: v.error })
    return
  }
  const updated: AutoReplyRule = { ...existing, ...v.value, id: existing.id, createdAt: existing.createdAt, updatedAt: Date.now() }
  store.saveRule(updated)
  store.logActivity('rule_updated', `Rule "${updated.name}" updated`, null)
  broadcast({ type: 'rule_changed', action: 'updated', rule: updated })
  res.json(updated)
})

rulesRouter.post('/:id/toggle', (req, res) => {
  const existing = store.getRule(req.params.id)
  if (!existing) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  existing.enabled = !existing.enabled
  existing.updatedAt = Date.now()
  store.saveRule(existing)
  broadcast({ type: 'rule_changed', action: 'updated', rule: existing })
  res.json(existing)
})

rulesRouter.delete('/:id', (req, res) => {
  const existing = store.getRule(req.params.id)
  if (!existing) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  store.deleteRule(req.params.id)
  store.logActivity('rule_deleted', `Rule "${existing.name}" deleted`, null)
  broadcast({ type: 'rule_changed', action: 'deleted', ruleId: req.params.id })
  res.json({ ok: true })
})
