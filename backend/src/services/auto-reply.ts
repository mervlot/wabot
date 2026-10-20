import { isJidGroup, jidNormalizedUser, type WAMessage } from '@whiskeysockets/baileys'
import { waManager } from '../wa/manager.ts'
import { store } from '../store.ts'
import { sender } from './sender.ts'
import { aiService } from './ai.ts'
import { broadcast } from '../ws.ts'
import { logger } from '../logger.ts'
import type { AutoReplyRule } from '../types.ts'

/** Per-chat reply timestamps for rate limiting (chatJid → timestamps). */
const chatReplyTimes = new Map<string, number[]>()
/** Per-rule-per-chat last trigger time for cooldowns. */
const cooldowns = new Map<string, number>()

function extractText(msg: WAMessage): string | null {
  const m = msg.message
  if (!m) return null
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.ephemeralMessage?.message?.conversation ||
    m.ephemeralMessage?.message?.extendedTextMessage?.text ||
    null
  )
}

function matchesKeyword(text: string, keyword: string, mode: AutoReplyRule['matchMode']): boolean {
  switch (mode) {
    case 'exact':
      return text === keyword
    case 'contains':
      return text.includes(keyword)
    case 'ci': {
      const t = text.toLowerCase()
      const k = keyword.toLowerCase()
      return t === k || t.includes(k)
    }
    default:
      return false
  }
}

function findMatchingRules(text: string, accountId: string, chatJid: string): AutoReplyRule[] {
  const isGroup = isJidGroup(chatJid)
  const now = Date.now()
  return store.data.rules
    .filter((rule) => {
      if (!rule.enabled) return false
      if (rule.accountIds.length > 0 && !rule.accountIds.includes(accountId)) return false
      if (rule.targetChats.length > 0 && !rule.targetChats.includes(chatJid)) return false
      if (isGroup && !store.data.settings.replyToGroups) return false
      if (!isGroup && !store.data.settings.replyToIndividuals) return false
      if (rule.cooldownSec > 0) {
        const key = `${rule.id}|${chatJid}`
        const last = cooldowns.get(key)
        if (last && now - last < rule.cooldownSec * 1000) return false
      }
      return rule.keywords.some((kw) => matchesKeyword(text, kw, rule.matchMode))
    })
    .sort((a, b) => a.priority - b.priority)
}

function chatRateOk(chatJid: string): boolean {
  const cap = store.data.settings.maxAutoRepliesPerChatPerMin
  if (cap <= 0) return true
  const now = Date.now()
  const list = (chatReplyTimes.get(chatJid) || []).filter((t) => now - t < 60_000)
  if (list.length >= cap) return false
  list.push(now)
  chatReplyTimes.set(chatJid, list)
  return true
}

async function runRule(rule: AutoReplyRule, accountId: string, chatJid: string, chatName: string): Promise<void> {
  const replies = rule.replies.filter((r) => r.trim().length > 0)
  if (replies.length === 0) return

  if (rule.cooldownSec > 0) {
    cooldowns.set(`${rule.id}|${chatJid}`, Date.now())
  }

  const chosen = rule.replyMode === 'all' ? replies : [replies[Math.floor(Math.random() * replies.length)]]

  for (let i = 0; i < chosen.length; i++) {
    if (i > 0 && rule.delayMs > 0) {
      await new Promise((r) => setTimeout(r, rule.delayMs))
    }
    const res = await sender.sendSingle(accountId, chatJid, chosen[i], { skipRateLimit: true, ruleId: rule.id })
    if (res.ok) {
      store.logActivity('auto_reply', `Auto-reply "${rule.name}" → ${chatName}`, accountId)
      broadcast({ type: 'auto_reply', ruleId: rule.id, ruleName: rule.name, accountId, chatJid })
      // mark direction as auto in the last message record
      const msgs = store.getMessages({ accountId, chatJid, limit: 1 })
      if (msgs[0] && msgs[0].ruleId === rule.id) store.updateMessage(msgs[0].id, { direction: 'auto' })
    } else {
      logger.warn('auto-reply send failed', { rule: rule.name, err: res.error })
      break
    }
  }
}

async function maybeAiReply(accountId: string, chatJid: string, chatName: string, text: string): Promise<void> {
  if (!store.data.aiConfig.enabled) return
  const isGroup = isJidGroup(chatJid)
  if (isGroup) {
    const cfg = store.data.aiConfig
    if (!cfg.groupEnabled) return
    if (cfg.groupJids.length > 0 && !cfg.groupJids.includes(chatJid)) return
  }
  if (!chatRateOk(chatJid)) return

  const reply = await aiService.generateReply(text, chatName, Boolean(isGroup))
  if (!reply) return
  const res = await sender.sendSingle(accountId, chatJid, reply, { skipRateLimit: true })
  if (res.ok) {
    store.logActivity('ai_reply', `AI replied in ${chatName}`, accountId)
    const msgs = store.getMessages({ accountId, chatJid, limit: 1 })
    if (msgs[0]) store.updateMessage(msgs[0].id, { direction: 'auto' })
  }
}

export const autoReplyEngine = {
  /** Wire an account's incoming-message handler. Call on connect. */
  attach(accountId: string): void {
    waManager.onIncoming(accountId, (msg) => {
      void this.handleIncoming(accountId, msg)
    })
  },

  detach(accountId: string): void {
    waManager.offIncoming(accountId)
  },

  async handleIncoming(accountId: string, msg: WAMessage): Promise<void> {
    // Loop protection 1: never reply to our own messages.
    if (msg.key.fromMe) return

    const jid = msg.key.remoteJid
    if (!jid || jid === 'status@broadcast') return

    const chatJid = jidNormalizedUser(jid)
    const text = extractText(msg)
    if (!text) return

    const account = store.getAccount(accountId)
    const chatName = chatJid.split('@')[0]
    const chat = (await waManager.getChats(accountId)).find((c) => c.jid === chatJid)
    const displayName = chat?.name || chatName

    if (store.data.settings.logIncoming) {
      store.appendMessage({
        id: msg.key.id || `in-${Date.now()}`,
        accountId,
        chatJid,
        chatName: displayName,
        direction: 'in',
        text,
        status: 'delivered',
        error: null,
        timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now(),
        ruleId: null,
        sequenceId: null,
      })
      broadcast({
        type: 'message_incoming',
        accountId,
        chatJid,
        chatName: displayName,
        text,
        timestamp: Date.now(),
      })
    }

    // Loop protection 2: global per-chat rate limit.
    if (!chatRateOk(chatJid)) return

    // Priority: keyword rules first, then AI fallback.
    const rules = findMatchingRules(text, accountId, chatJid)
    if (rules.length > 0) {
      // fire the highest-priority rule only
      await runRule(rules[0], accountId, chatJid, displayName)
      return
    }

    await maybeAiReply(accountId, chatJid, displayName, text)
  },
}

export function initAutoReplyForAll(): void {
  for (const account of store.data.accounts) {
    if (account.status === 'connected') {
      autoReplyEngine.attach(account.id)
    }
  }
}
