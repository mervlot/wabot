import { randomUUID } from 'node:crypto'
import { waManager } from '../wa/manager.ts'
import { store } from '../store.ts'
import { broadcast } from '../ws.ts'
import { logger } from '../logger.ts'
import type { SequenceJob } from '../types.ts'

const sequences = new Map<string, SequenceJob>()
const recentSends = new Map<string, number[]>() // key: accountId|jid → timestamps

function rateKey(accountId: string, jid: string): string {
  return `${accountId}|${jid}`
}

function checkRateLimit(accountId: string, jid: string): boolean {
  const limit = store.data.settings.rateLimitPerMinute
  if (limit <= 0) return true
  const key = rateKey(accountId, jid)
  const now = Date.now()
  const window = (recentSends.get(key) || []).filter((t) => now - t < 60_000)
  if (window.length >= limit) return false
  window.push(now)
  recentSends.set(key, window)
  return true
}

export const sender = {
  get sequences(): Map<string, SequenceJob> {
    return sequences
  },

  getSequence(id: string): SequenceJob | undefined {
    return sequences.get(id)
  },

  listSequences(accountId?: string): SequenceJob[] {
    const all = Array.from(sequences.values()).sort((a, b) => b.createdAt - a.createdAt)
    return accountId ? all.filter((s) => s.accountId === accountId) : all
  },

  async sendSingle(
    accountId: string,
    jid: string,
    text: string,
    opts: { skipRateLimit?: boolean; ruleId?: string } = {},
  ): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    if (!text || !text.trim()) return { ok: false, error: 'Empty message' }
    if (!opts.skipRateLimit && !checkRateLimit(accountId, jid)) {
      return { ok: false, error: 'Rate limit reached for this chat (wait a minute)' }
    }
    try {
      const messageId = await waManager.sendText(accountId, jid, text)
      const record = {
        id: randomUUID(),
        accountId,
        chatJid: jid,
        chatName: jid.split('@')[0],
        direction: 'out' as const,
        text,
        status: 'sent' as const,
        error: null,
        timestamp: Date.now(),
        ruleId: opts.ruleId ?? null,
        sequenceId: null,
      }
      store.appendMessage(record)
      store.logActivity('message_sent', `Message sent to ${jid.split('@')[0]}`, accountId)
      broadcast({ type: 'message_sent', ...record })
      return { ok: true, messageId }
    } catch (err) {
      const errMsg = String(err)
      logger.error('send failed', { accountId, jid, err: errMsg })
      store.logError('wa', 'Message send failed', errMsg, accountId)
      store.appendMessage({
        id: randomUUID(),
        accountId,
        chatJid: jid,
        chatName: jid.split('@')[0],
        direction: 'out',
        text,
        status: 'error',
        error: errMsg,
        timestamp: Date.now(),
        ruleId: opts.ruleId ?? null,
        sequenceId: null,
      })
      return { ok: false, error: errMsg }
    }
  },

  /**
   * Send a sequence of messages to one chat with a delay between each.
   * Runs asynchronously; progress is reported over the WebSocket.
   */
  startSequence(accountId: string, jid: string, messages: string[], delayMs: number): SequenceJob {
    const job: SequenceJob = {
      id: randomUUID(),
      accountId,
      jid,
      messages: messages.filter((m) => m.trim().length > 0),
      delayMs: Math.max(500, Math.min(delayMs, 120_000)),
      status: 'running',
      results: [],
      createdAt: Date.now(),
      finishedAt: null,
    }
    sequences.set(job.id, job)
    broadcast({ type: 'sequence_start', sequence: job })

    void (async () => {
      for (let i = 0; i < job.messages.length; i++) {
        if ((job.status as string) === 'cancelled') break
        const res = await this.sendSingle(accountId, jid, job.messages[i])
        job.results.push({
          index: i,
          status: res.ok ? 'sent' : 'error',
          error: res.error,
        })
        broadcast({ type: 'sequence_progress', sequenceId: job.id, index: i, status: res.ok ? 'sent' : 'error', error: res.error })
        if (i < job.messages.length - 1 && (job.status as string) !== 'cancelled') {
          await new Promise((r) => setTimeout(r, job.delayMs))
        }
      }
      if ((job.status as string) !== 'cancelled') job.status = 'done'
      job.finishedAt = Date.now()
      broadcast({ type: 'sequence_done', sequence: job })
    })()

    return job
  },

  cancelSequence(id: string): boolean {
    const job = sequences.get(id)
    if (!job || job.status !== 'running') return false
    job.status = 'cancelled'
    job.finishedAt = Date.now()
    for (let i = job.results.length; i < job.messages.length; i++) {
      job.results.push({ index: i, status: 'cancelled' })
    }
    broadcast({ type: 'sequence_done', sequence: job })
    return true
  },

  clearOldSequences(): void {
    const cutoff = Date.now() - 3600_000
    for (const [id, job] of sequences) {
      if (job.finishedAt && job.finishedAt < cutoff) sequences.delete(id)
    }
  },
}
