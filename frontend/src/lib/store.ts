import { create } from 'zustand'
import { api, clearToken, getToken, setToken } from './api.ts'
import { wsClient } from './ws.ts'
import type { Account, AutoReplyRule, OverviewData, ActivityRecord, ErrorRecord, AIConfigView, AppSettings, MessageRecord } from './types.ts'

interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
}

interface AppState {
  authed: boolean
  wsConnected: boolean
  loading: boolean
  accounts: Account[]
  rules: AutoReplyRule[]
  overview: OverviewData | null
  activity: ActivityRecord[]
  errors: ErrorRecord[]
  settings: AppSettings | null
  aiConfig: AIConfigView | null
  history: MessageRecord[]
  toasts: Toast[]

  login: (token: string) => Promise<void>
  logout: () => void
  bootstrap: () => Promise<void>
  refresh: () => Promise<void>
  refreshAccounts: () => Promise<void>
  refreshRules: () => Promise<void>
  refreshHistory: (params?: { accountId?: string; chatJid?: string; direction?: string }) => Promise<void>
  refreshAi: () => Promise<void>
  refreshSettings: () => Promise<void>
  toast: (kind: Toast['kind'], message: string) => void
  dismissToast: (id: number) => void
}

let toastId = 1

export const useStore = create<AppState>((set, get) => ({
  authed: Boolean(getToken()),
  wsConnected: false,
  loading: false,
  accounts: [],
  rules: [],
  overview: null,
  activity: [],
  errors: [],
  settings: null,
  aiConfig: null,
  history: [],
  toasts: [],

  async login(token) {
    await api.login(token)
    setToken(token)
    set({ authed: true })
    wsClient.start()
    await get().bootstrap()
  },

  logout() {
    clearToken()
    wsClient.stop()
    set({ authed: false, overview: null, accounts: [], rules: [] })
  },

  async bootstrap() {
    set({ loading: true })
    wsClient.start()
    try {
      await get().refresh()
    } finally {
      set({ loading: false })
    }
  },

  async refresh() {
    await Promise.allSettled([
      get().refreshAccounts(),
      get().refreshRules(),
      get().refreshAi(),
      get().refreshSettings(),
      api.overview().then((overview) => set({ overview })),
      api.activity(40).then((activity) => set({ activity })),
      api.errors(40).then((errors) => set({ errors })),
    ])
  },

  async refreshAccounts() {
    try {
      const accounts = await api.accounts()
      set({ accounts })
    } catch (err) {
      console.error('refreshAccounts', err)
    }
  },

  async refreshRules() {
    try {
      const rules = await api.rules()
      set({ rules })
    } catch (err) {
      console.error('refreshRules', err)
    }
  },

  async refreshHistory(params = {}) {
    try {
      const history = await api.history({ limit: 300, ...params })
      set({ history })
    } catch (err) {
      console.error('refreshHistory', err)
    }
  },

  async refreshAi() {
    try {
      const aiConfig = await api.aiConfig()
      set({ aiConfig })
    } catch (err) {
      console.error('refreshAi', err)
    }
  },

  async refreshSettings() {
    try {
      const settings = await api.settings()
      set({ settings })
    } catch (err) {
      console.error('refreshSettings', err)
    }
  },

  toast(kind, message) {
    const id = toastId++
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }] }))
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 4000)
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

// Wire real-time events into the store
let wired = false
export function initRealtime(): void {
  if (wired) return
  wired = true

  wsClient.on('__connected', () => useStore.setState({ wsConnected: true }))
  wsClient.on('__disconnected', () => useStore.setState({ wsConnected: false }))

  wsClient.on('account_status', () => {
    useStore.getState().refreshAccounts()
    api.overview().then((overview) => useStore.setState({ overview })).catch(() => {})
  })
  wsClient.on('qr', (msg) => {
    const accountId = String(msg.accountId)
    const qr = String(msg.qr)
    useStore.setState((s) => ({
      accounts: s.accounts.map((a) => (a.id === accountId ? { ...a, status: 'qr', qr } : a)),
    }))
  })
  wsClient.on('pairing_code', (msg) => {
    const accountId = String(msg.accountId)
    const pairingCode = String(msg.code)
    const pairingPhone = String(msg.phone)
    useStore.setState((s) => ({
      accounts: s.accounts.map((a) => (a.id === accountId ? { ...a, status: 'pairing', pairingCode, pairingPhone } : a)),
    }))
  })
  wsClient.on('account_connected', () => {
    useStore.getState().refreshAccounts()
    useStore.getState().toast('success', 'WhatsApp account connected')
    api.overview().then((overview) => useStore.setState({ overview })).catch(() => {})
  })
  wsClient.on('chats_loaded', () => {
    /* chat pages refetch on demand */
  })
  wsClient.on('rule_changed', () => {
    useStore.getState().refreshRules()
    api.overview().then((overview) => useStore.setState({ overview })).catch(() => {})
  })
  wsClient.on('ai_config_changed', () => {
    useStore.getState().refreshAi()
  })
  wsClient.on('settings_changed', () => {
    useStore.getState().refreshSettings()
  })
  wsClient.on('message_sent', () => {
    api.overview().then((overview) => useStore.setState({ overview })).catch(() => {})
  })
  wsClient.on('message_incoming', (msg) => {
    useStore.setState((s) => ({
      history: [
        {
          id: `in-${Date.now()}`,
          accountId: String(msg.accountId ?? ''),
          chatJid: String(msg.chatJid ?? ''),
          chatName: String(msg.chatName ?? ''),
          direction: 'in' as const,
          text: String(msg.text ?? ''),
          status: 'delivered' as const,
          error: null,
          timestamp: Number(msg.timestamp ?? Date.now()),
          ruleId: null,
          sequenceId: null,
        },
        ...s.history,
      ].slice(0, 300),
    }))
  })
  wsClient.on('auto_reply', (msg) => {
    useStore.getState().toast('info', `Auto-reply "${String(msg.ruleName ?? '')}" sent`)
  })
  wsClient.on('error', (msg) => {
    useStore.getState().toast('error', String(msg.message ?? 'Unknown error'))
  })
}
