const TOKEN_KEY = 'wa_token'

export function getToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(status: number, body: Record<string, unknown>) {
    super(String(body.error || `HTTP ${status}`))
    this.status = status
    this.body = body
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text.slice(0, 200) }
    }
  }
  if (!res.ok) {
    if (res.status === 401 && path !== '/login') clearToken()
    throw new ApiError(res.status, (data as Record<string, unknown>) || {})
  }
  return data as T
}

export const api = {
  login: (token: string) => request<{ ok: boolean }>('POST', '/login', { token }),
  overview: () => request<import('./types.ts').OverviewData>('GET', '/overview'),
  activity: (limit = 50) => request<import('./types.ts').ActivityRecord[]>('GET', `/activity?limit=${limit}`),
  errors: (limit = 50) => request<import('./types.ts').ErrorRecord[]>('GET', `/errors?limit=${limit}`),
  clearErrors: () => request<{ ok: boolean }>('DELETE', '/errors'),
  settings: () => request<import('./types.ts').AppSettings>('GET', '/settings'),
  saveSettings: (s: Partial<import('./types.ts').AppSettings>) => request<import('./types.ts').AppSettings>('PUT', '/settings', s),
  regenerateToken: () => request<{ token: string }>('POST', '/settings/regenerate-token'),

  accounts: () => request<import('./types.ts').Account[]>('GET', '/accounts'),
  createAccount: (name: string) => request<import('./types.ts').Account>('POST', '/accounts', { name }),
  getAccount: (id: string) => request<import('./types.ts').Account>('GET', `/accounts/${id}`),
  connectAccount: (id: string) => request<{ ok: boolean }>('POST', `/accounts/${id}/connect`),
  pairAccount: (id: string, phone: string) => request<{ ok: boolean; status: string }>('POST', `/accounts/${id}/pair`, { phone }),
  disconnectAccount: (id: string) => request<{ ok: boolean }>('POST', `/accounts/${id}/disconnect`),
  deleteAccount: (id: string) => request<{ ok: boolean }>('DELETE', `/accounts/${id}`),
  chats: (id: string) => request<import('./types.ts').ChatInfo[]>('GET', `/accounts/${id}/chats`),

  sendMessage: (accountId: string, jid: string, text: string) =>
    request<{ ok: boolean }>('POST', '/messages/send', { accountId, jid, text }),
  sendSequence: (accountId: string, jid: string, messages: string[], delayMs: number, confirmed = false) =>
    request<import('./types.ts').SequenceJob>('POST', '/messages/sequence', { accountId, jid, messages, delayMs, confirmed }),
  cancelSequence: (id: string) => request<{ ok: boolean }>('POST', `/messages/sequence/${id}/cancel`),
  sequences: (accountId?: string) =>
    request<import('./types.ts').SequenceJob[]>('GET', `/messages/sequences${accountId ? `?accountId=${accountId}` : ''}`),
  history: (params: { accountId?: string; chatJid?: string; direction?: string; limit?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.accountId) q.set('accountId', params.accountId)
    if (params.chatJid) q.set('chatJid', params.chatJid)
    if (params.direction) q.set('direction', params.direction)
    if (params.limit) q.set('limit', String(params.limit))
    return request<import('./types.ts').MessageRecord[]>('GET', `/messages/history?${q}`)
  },

  rules: () => request<import('./types.ts').AutoReplyRule[]>('GET', '/rules'),
  createRule: (rule: Partial<import('./types.ts').AutoReplyRule>) => request<import('./types.ts').AutoReplyRule>('POST', '/rules', rule),
  updateRule: (id: string, rule: Partial<import('./types.ts').AutoReplyRule>) =>
    request<import('./types.ts').AutoReplyRule>('PUT', `/rules/${id}`, rule),
  toggleRule: (id: string) => request<import('./types.ts').AutoReplyRule>('POST', `/rules/${id}/toggle`),
  deleteRule: (id: string) => request<{ ok: boolean }>('DELETE', `/rules/${id}`),

  aiProviders: () => request<import('./types.ts').AIProvider[]>('GET', '/ai/providers'),
  aiConfig: () => request<import('./types.ts').AIConfigView>('GET', '/ai/config'),
  saveAiConfig: (cfg: Record<string, unknown>) => request<import('./types.ts').AIConfigView>('PUT', '/ai/config', cfg),
  removeAiConfig: () => request<import('./types.ts').AIConfigView>('DELETE', '/ai/config'),
  testAi: () => request<{ ok: boolean; text?: string; error?: string; latencyMs: number }>('POST', '/ai/test'),
  setAiEnabled: (enabled: boolean, groupEnabled?: boolean) =>
    request<import('./types.ts').AIConfigView>('PUT', '/ai/enable', { enabled, groupEnabled }),
}
