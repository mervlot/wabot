import { randomBytes } from 'node:crypto'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadDotEnv(): void {
  const path = resolve(process.cwd(), '.env')
  if (!existsSync(path)) return
  try {
    const text = readFileSync(path, 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  } catch {
    /* ignore malformed .env */
  }
}

loadDotEnv()

const dataDir = resolve(process.env.DATA_DIR || './data')
mkdirSync(dataDir, { recursive: true })
mkdirSync(resolve(dataDir, 'sessions'), { recursive: true })
mkdirSync(resolve(dataDir, 'logs'), { recursive: true })

export const config = {
  host: process.env.HOST || '127.0.0.1',
  port: parseInt(process.env.PORT || '3456', 10),
  dataDir,
  sessionsDir: resolve(dataDir, 'sessions'),
  logsDir: resolve(dataDir, 'logs'),
  storeFile: resolve(dataDir, 'store.json'),
  messagesFile: resolve(dataDir, 'messages.jsonl'),
  apiToken: process.env.API_TOKEN || randomBytes(24).toString('hex'),
  tokenFromEnv: Boolean(process.env.API_TOKEN),
  maxMessagesInMemory: 10000,
  maxActivity: 500,
  maxErrors: 200,
}
