import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from './config.ts'

type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

const levelOrder: Record<Level, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
}

const minLevel = (process.env.LOG_LEVEL as Level) || 'info'
const logFile = resolve(config.logsDir, 'app.log')

function write(level: Level, msg: string, extra?: Record<string, unknown>): void {
  if (levelOrder[level] < levelOrder[minLevel]) return
  const entry = {
    t: new Date().toISOString(),
    level,
    msg,
    ...extra,
  }
  const line = JSON.stringify(entry)
  const prefix = level === 'error' || level === 'fatal' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : level === 'info' ? '\x1b[36m' : '\x1b[90m'
  console.log(`${prefix}${level.toUpperCase().padEnd(5)}\x1b[0m ${entry.t} ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`)
  try {
    appendFileSync(logFile, line + '\n')
  } catch {
    /* disk full / readonly – never crash on logging */
  }
}

export const logger = {
  trace: (msg: string, extra?: Record<string, unknown>) => write('trace', msg, extra),
  debug: (msg: string, extra?: Record<string, unknown>) => write('debug', msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => write('info', msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => write('warn', msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => write('error', msg, extra),
  fatal: (msg: string, extra?: Record<string, unknown>) => write('fatal', msg, extra),
  child(bindings: Record<string, unknown>) {
    return {
      trace: (m: string, e?: Record<string, unknown>) => write('trace', m, { ...bindings, ...e }),
      debug: (m: string, e?: Record<string, unknown>) => write('debug', m, { ...bindings, ...e }),
      info: (m: string, e?: Record<string, unknown>) => write('info', m, { ...bindings, ...e }),
      warn: (m: string, e?: Record<string, unknown>) => write('warn', m, { ...bindings, ...e }),
      error: (m: string, e?: Record<string, unknown>) => write('error', m, { ...bindings, ...e }),
      fatal: (m: string, e?: Record<string, unknown>) => write('fatal', m, { ...bindings, ...e }),
    }
  },
}

/** Pino-compatible shim handed to Baileys. */
export function baileysLogger(accountId: string) {
  const l = logger.child({ wa: accountId })
  const shim = {
    level: 'silent',
    trace: () => {},
    debug: () => {},
    info: (obj: unknown, msg?: string) => l.debug(String(msg ?? ''), typeof obj === 'object' ? (obj as Record<string, unknown>) : undefined),
    warn: (obj: unknown, msg?: string) => l.warn(String(msg ?? ''), typeof obj === 'object' ? (obj as Record<string, unknown>) : undefined),
    error: (obj: unknown, msg?: string) => l.error(String(msg ?? ''), typeof obj === 'object' ? (obj as Record<string, unknown>) : undefined),
    fatal: () => {},
    child: () => shim,
  }
  return shim
}
