import express from 'express'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from './config.ts'
import { logger } from './logger.ts'
import { store } from './store.ts'
import { setupWebSocket } from './ws.ts'
import { apiRouter } from './routes/index.ts'
import { waManager } from './wa/manager.ts'
import { autoReplyEngine } from './services/auto-reply.ts'

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  next()
})

// Request logging (method, path, status, duration) — never logs bodies or tokens
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    if (req.path.startsWith('/api') || res.statusCode >= 400) {
      logger.info(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`)
    }
  })
  next()
})

app.use('/api', apiRouter)

// Serve the built frontend in production
const frontendDist = resolve(import.meta.dirname, '../../frontend/dist')
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { index: false, maxAge: '1h' }))
  app.get(/^(?!\/api|\/ws).*/, (_req, res) => {
    res.sendFile(resolve(frontendDist, 'index.html'))
  })
  logger.info('serving frontend', { dir: frontendDist })
} else {
  logger.info('frontend build not found – API only mode (run deno task build in frontend/ for production)')
}

// Central error handler — never leak stack traces to clients
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('unhandled error', { err: err.message, stack: err.stack })
  store.logError('api', 'Unhandled API error', err.message, null)
  res.status(500).json({ error: 'Internal server error' })
})

const server = createServer(app)
setupWebSocket(server)

// Wire auto-reply for any accounts that are already connected (after restart, none are until reconnected)
function restoreState(): void {
  logger.info('restoring state', { accounts: store.data.accounts.length, rules: store.data.rules.length })
  for (const account of store.data.accounts) {
    if (account.status !== 'disconnected') {
      account.status = 'disconnected'
      account.qr = null
      account.jid = null
      store.saveAccount(account)
    }
  }
  store.saveNow()
}

server.listen(config.port, config.host, () => {
  restoreState()
  logger.info('server listening', { host: config.host, port: config.port })
  logger.info(`Dashboard: http://${config.host}:${config.port}`)
  if (!config.tokenFromEnv && !store.data.apiToken) {
    logger.warn('no API token set – set API_TOKEN in .env')
  }
  logger.info(`API token (first 8): ${store.data.apiToken.slice(0, 8)}… (full token in ${config.storeFile} or set via API_TOKEN env var)`)
})

async function shutdown(): Promise<void> {
  logger.info('shutting down')
  await waManager.shutdown()
  store.saveNow()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5000).unref()
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
process.on('uncaughtException', (err) => {
  logger.fatal('uncaught exception', { err: err.message, stack: err.stack })
  store.logError('system', 'Uncaught exception', err.message, null)
})
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled rejection', { reason: String(reason) })
})
