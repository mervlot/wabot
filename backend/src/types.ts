export type ConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'pairing' | 'connected' | 'error'

export interface Account {
  id: string
  name: string
  status: ConnectionStatus
  jid: string | null
  pushName: string | null
  qr: string | null
  // Pairing-code (phone-number linking) state — the code is short-lived and
  // only ever exposed while status === 'pairing'.
  pairingCode: string | null
  pairingPhone: string | null
  lastError: string | null
  createdAt: number
  connectedAt: number | null
}

export type MatchMode = 'exact' | 'contains' | 'ci'

export interface AutoReplyRule {
  id: string
  name: string
  keywords: string[]
  matchMode: MatchMode
  replies: string[]
  replyMode: 'one' | 'all'
  delayMs: number
  cooldownSec: number
  priority: number
  accountIds: string[]
  targetChats: string[]
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface AIConfig {
  provider: 'openai' | 'anthropic'
  endpoint: string
  apiKey: string
  model: string
  systemPrompt: string
  maxTokens: number
  temperature: number
  enabled: boolean
  groupEnabled: boolean
  groupJids: string[]
  fallbackReply: string
}

export interface AppSettings {
  rateLimitPerMinute: number
  autoReconnect: boolean
  replyToGroups: boolean
  replyToIndividuals: boolean
  maxAutoRepliesPerChatPerMin: number
  logIncoming: boolean
}

export interface MessageRecord {
  id: string
  accountId: string
  chatJid: string
  chatName: string
  direction: 'out' | 'in' | 'auto'
  text: string
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'error'
  error: string | null
  timestamp: number
  ruleId: string | null
  sequenceId: string | null
}

export interface ActivityRecord {
  id: string
  type:
    | 'account_created'
    | 'account_connected'
    | 'account_disconnected'
    | 'qr_generated'
    | 'message_sent'
    | 'auto_reply'
    | 'ai_reply'
    | 'rule_created'
    | 'rule_updated'
    | 'rule_deleted'
    | 'ai_configured'
    | 'settings_updated'
    | 'error'
  message: string
  accountId: string | null
  timestamp: number
}

export interface ErrorRecord {
  id: string
  source: 'wa' | 'api' | 'ai' | 'auto-reply' | 'system'
  message: string
  detail: string | null
  accountId: string | null
  timestamp: number
}

export interface ChatInfo {
  jid: string
  name: string
  isGroup: boolean
  unread: number
  lastMessageTime: number
  participants?: number
}

export interface SequenceJob {
  id: string
  accountId: string
  jid: string
  messages: string[]
  delayMs: number
  status: 'pending' | 'running' | 'done' | 'cancelled' | 'error'
  results: Array<{ index: number; status: 'sent' | 'error' | 'cancelled'; error?: string }>
  createdAt: number
  finishedAt: number | null
}

export interface StoreData {
  accounts: Account[]
  rules: AutoReplyRule[]
  aiConfig: AIConfig
  settings: AppSettings
  activity: ActivityRecord[]
  errors: ErrorRecord[]
  apiToken: string
}

export interface WSMessage {
  type: string
  [key: string]: unknown
}
