import { readFileSync, writeFileSync, renameSync, existsSync, appendFileSync, openSync, readSync, closeSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { config } from './config.ts'
import { logger } from './logger.ts'
import type {
  Account,
  ActivityRecord,
  AIConfig,
  AppSettings,
  AutoReplyRule,
  ErrorRecord,
  MessageRecord,
  StoreData,
} from './types.ts'

const defaults: Omit<StoreData, 'apiToken'> = {
  accounts: [],
  rules: [],
  aiConfig: {
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    systemPrompt: 'You are a helpful, concise assistant replying on behalf of the user in a WhatsApp chat. Keep replies short and natural.',
    maxTokens: 300,
    temperature: 0.7,
    enabled: false,
    groupEnabled: false,
    groupJids: [],
    fallbackReply: '',
  },
  settings: {
    rateLimitPerMinute: 15,
    autoReconnect: true,
    replyToGroups: true,
    replyToIndividuals: true,
    maxAutoRepliesPerChatPerMin: 5,
    logIncoming: false,
  },
  activity: [],
  errors: [],
}

class Store {
  data: StoreData
  private messages: MessageRecord[] = []
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.data = this.loadMain()
    this.messages = this.loadMessages()
  }

  private loadMain(): StoreData {
    if (!existsSync(config.storeFile)) {
      const fresh: StoreData = { ...structuredClone(defaults), apiToken: config.apiToken }
      this.writeAtomic(config.storeFile, JSON.stringify(fresh, null, 2))
      return fresh
    }
    try {
      const raw = JSON.parse(readFileSync(config.storeFile, 'utf8')) as Partial<StoreData>
      return {
        accounts: raw.accounts ?? [],
        rules: raw.rules ?? [],
        aiConfig: { ...structuredClone(defaults.aiConfig), ...(raw.aiConfig ?? {}) },
        settings: { ...structuredClone(defaults.settings), ...(raw.settings ?? {}) },
        activity: raw.activity ?? [],
        errors: raw.errors ?? [],
        apiToken: config.tokenFromEnv ? config.apiToken : raw.apiToken || config.apiToken,
      }
    } catch (err) {
      logger.error('store: failed to load, starting fresh', { err: String(err) })
      const backup = config.storeFile + '.corrupt.' + Date.now()
      try {
        renameSync(config.storeFile, backup)
      } catch { /* ignore */ }
      return { ...structuredClone(defaults), apiToken: config.apiToken }
    }
  }

  private loadMessages(): MessageRecord[] {
    if (!existsSync(config.messagesFile)) return []
    try {
      const text = readFileSync(config.messagesFile, 'utf8')
      const lines = text.split('\n').filter(Boolean)
      const slice = lines.slice(-config.maxMessagesInMemory)
      const out: MessageRecord[] = []
      for (const line of slice) {
        try {
          out.push(JSON.parse(line) as MessageRecord)
        } catch { /* skip corrupt line */ }
      }
      return out
    } catch {
      return []
    }
  }

  private writeAtomic(path: string, content: string): void {
    const tmp = path + '.tmp'
    writeFileSync(tmp, content)
    renameSync(tmp, path)
  }

  /** Debounced persist of the main store file. */
  scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.saveNow()
    }, 400)
  }

  saveNow(): void {
    try {
      this.writeAtomic(config.storeFile, JSON.stringify(this.data, null, 2))
    } catch (err) {
      logger.error('store: save failed', { err: String(err) })
    }
  }

  appendMessage(msg: MessageRecord): void {
    this.messages.push(msg)
    if (this.messages.length > config.maxMessagesInMemory) {
      this.messages.splice(0, this.messages.length - config.maxMessagesInMemory)
    }
    try {
      appendFileSync(config.messagesFile, JSON.stringify(msg) + '\n')
    } catch (err) {
      logger.warn('store: message append failed', { err: String(err) })
    }
  }

  updateMessage(id: string, patch: Partial<MessageRecord>): void {
    const m = this.messages.find((x) => x.id === id)
    if (!m) return
    Object.assign(m, patch)
    // rewrite the jsonl file with the updated in-memory buffer (bounded size, cheap)
    try {
      const content = this.messages.map((x) => JSON.stringify(x)).join('\n') + '\n'
      this.writeAtomic(config.messagesFile, content)
    } catch (err) {
      logger.warn('store: message rewrite failed', { err: String(err) })
    }
  }

  getMessages(filter?: { accountId?: string; chatJid?: string; limit?: number; direction?: string }): MessageRecord[] {
    let list = this.messages
    if (filter?.accountId) list = list.filter((m) => m.accountId === filter.accountId)
    if (filter?.chatJid) list = list.filter((m) => m.chatJid === filter.chatJid)
    if (filter?.direction) list = list.filter((m) => m.direction === filter.direction)
    const limit = filter?.limit ?? 200
    return list.slice(-limit).reverse()
  }

  logActivity(type: ActivityRecord['type'], message: string, accountId: string | null = null): void {
    const rec: ActivityRecord = { id: randomUUID(), type, message, accountId, timestamp: Date.now() }
    this.data.activity.push(rec)
    if (this.data.activity.length > config.maxActivity) {
      this.data.activity.splice(0, this.data.activity.length - config.maxActivity)
    }
    this.scheduleSave()
  }

  logError(source: ErrorRecord['source'], message: string, detail: string | null = null, accountId: string | null = null): void {
    const rec: ErrorRecord = { id: randomUUID(), source, message, detail, accountId, timestamp: Date.now() }
    this.data.errors.push(rec)
    if (this.data.errors.length > config.maxErrors) {
      this.data.errors.splice(0, this.data.errors.length - config.maxErrors)
    }
    this.scheduleSave()
  }

  getAccount(id: string): Account | undefined {
    return this.data.accounts.find((a) => a.id === id)
  }

  saveAccount(account: Account): void {
    const idx = this.data.accounts.findIndex((a) => a.id === account.id)
    if (idx >= 0) this.data.accounts[idx] = account
    else this.data.accounts.push(account)
    this.scheduleSave()
  }

  deleteAccount(id: string): void {
    this.data.accounts = this.data.accounts.filter((a) => a.id !== id)
    this.scheduleSave()
  }

  getRule(id: string): AutoReplyRule | undefined {
    return this.data.rules.find((r) => r.id === id)
  }

  saveRule(rule: AutoReplyRule): void {
    const idx = this.data.rules.findIndex((r) => r.id === rule.id)
    if (idx >= 0) this.data.rules[idx] = rule
    else this.data.rules.push(rule)
    this.scheduleSave()
  }

  deleteRule(id: string): void {
    this.data.rules = this.data.rules.filter((r) => r.id !== id)
    this.scheduleSave()
  }
}

export const store = new Store()

process.on('exit', () => store.saveNow())
process.on('SIGINT', () => {
  store.saveNow()
  process.exit(0)
})
process.on('SIGTERM', () => {
  store.saveNow()
  process.exit(0)
})
