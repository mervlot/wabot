import { getToken } from './api.ts'

type Handler = (data: Record<string, unknown>) => void

const handlers = new Map<string, Set<Handler>>()
let ws: WebSocket | null = null
let retry = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let closedByUser = false

function connect(): void {
  if (closedByUser) return
  const token = getToken()
  if (!token) return
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  try {
    ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`)
  } catch {
    scheduleRetry()
    return
  }
  ws.onopen = () => {
    retry = 0
    emitLocal('__connected', {})
  }
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string) as Record<string, unknown>
      if (typeof msg.type === 'string') emit(msg.type, msg)
    } catch {
      /* ignore malformed frames */
    }
  }
  ws.onclose = () => {
    ws = null
    emitLocal('__disconnected', {})
    scheduleRetry()
  }
  ws.onerror = () => {
    try {
      ws?.close()
    } catch {
      /* ignore */
    }
  }
}

function scheduleRetry(): void {
  if (closedByUser || reconnectTimer) return
  retry++
  const delay = Math.min(1000 * Math.pow(1.7, retry), 15000)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

function emit(type: string, data: Record<string, unknown>): void {
  const set = handlers.get(type)
  if (!set) return
  for (const fn of set) {
    try {
      fn(data)
    } catch {
      /* isolate handler errors */
    }
  }
}

function emitLocal(type: string, data: Record<string, unknown>): void {
  emit(type, data)
}

export const wsClient = {
  start(): void {
    closedByUser = false
    if (!ws && !reconnectTimer) connect()
  },
  stop(): void {
    closedByUser = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    ws?.close()
    ws = null
  },
  on(type: string, handler: Handler): () => void {
    let set = handlers.get(type)
    if (!set) {
      set = new Set()
      handlers.set(type, set)
    }
    set.add(handler)
    return () => {
      set!.delete(handler)
    }
  },
  isConnected(): boolean {
    return ws?.readyState === WebSocket.OPEN
  },
}
