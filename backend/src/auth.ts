import { timingSafeEqual } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { store } from './store.ts'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) {
    // still burn a comparison to keep timing roughly constant
    timingSafeEqual(ab, ab)
    return false
  }
  return timingSafeEqual(ab, bb)
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token as string) || ''
  if (!token || !safeEqual(token, store.data.apiToken)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

export function validateToken(token: string): boolean {
  return Boolean(token) && safeEqual(token, store.data.apiToken)
}
