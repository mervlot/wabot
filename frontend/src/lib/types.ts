export type ConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'pairing' | 'connected' | 'error'

export interface Account {
  id: string
  name: string
  status: ConnectionStatus
  jid: string | null
  pushName: string | null
  qr: string | null
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

export interface ChatInfo {
  jid: string
  name: string
  isGroup: boolean
  unread: number
  lastMessageTime: number
  participants?: number
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
  type: string
  message: string
  accountId: string | null
  timestamp: number
}

export interface ErrorRecord {
  id: string
  source: string
  message: string
  detail: string | null
  accountId: string | null
  timestamp: number
}

export interface AIConfigView {
  provider: 'openai' | 'anthropic'
  endpoint: string
  apiKeyMasked: string
  hasApiKey: boolean
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

export interface OverviewData {
  accounts: {
    total: number
    connected: number
    connecting: number
    detail: Array<{ id: string; name: string; status: ConnectionStatus; jid: string | null; pushName: string | null }>
  }
  rules: { total: number; enabled: number }
  messages: { sentToday: number; autoToday: number; total: number }
  aiEnabled: boolean
  recentActivity: ActivityRecord[]
  recentErrors: ErrorRecord[]
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

export interface AIProvider {
  id: string
  label: string
  defaultEndpoint: string
}
