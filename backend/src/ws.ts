import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'
import { logger } from './logger.ts'
import { validateToken } from './auth.ts'
import type { WSMessage } from './types.ts'

const clients = new Set<WebSocket>()

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost')
    if (url.pathname !== '/ws') {
      socket.destroy()
      return
    }
    const token = url.searchParams.get('token') || ''
    if (!validateToken(token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (ws) => {
    clients.add(ws)
    ws.on('close', () => clients.delete(ws))
    ws.on('error', () => clients.delete(ws))
    ws.send(JSON.stringify({ type: 'connected', ts: Date.now() }))
  })

  return wss
}

export function broadcast(msg: WSMessage): void {
  const payload = JSON.stringify(msg)
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload)
      } catch {
        /* ignore individual socket failures */
      }
    }
  }
}

export function clientCount(): number {
  return clients.size
}
