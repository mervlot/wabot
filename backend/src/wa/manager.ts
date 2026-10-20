import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  isJidGroup,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AnyMessageContent, WAMessage, WASocket } from '@whiskeysockets/baileys'
import { config } from '../config.ts'
import { logger, baileysLogger } from '../logger.ts'
import { store } from '../store.ts'
import { broadcast } from '../ws.ts'
import type { Account, ChatInfo } from '../types.ts'

interface WASession {
  sock: WASocket
  accountId: string
  qr: string | null
  chats: Map<string, ChatInfo>
  reconnecting: boolean
  closing: boolean
  // When set, we're linking via pairing code: the QR is suppressed and the
  // socket requested a code for this phone number.
  pairingPhone: string | null
  pairingRequested: boolean
}

const sessions = new Map<string, WASession>()
const incomingListeners = new Map<string, (msg: WAMessage) => void>()
const statusListeners = new Set<(accountId: string, status: Account['status']) => void>()

function setStatus(accountId: string, status: Account['status'], extra: Partial<Account> = {}): void {
  const account = store.getAccount(accountId)
  if (!account) return
  account.status = status
  Object.assign(account, extra)
  store.saveAccount(account)
  broadcast({ type: 'account_status', accountId, status, jid: account.jid, pushName: account.pushName })
  for (const fn of statusListeners) {
    try {
      fn(accountId, status)
    } catch {
      /* ignore listener errors */
    }
  }
}

function recordChat(session: WASession, jid: string, name: string, isGroup: boolean, extra: Partial<ChatInfo> = {}): void {
  if (!jid || jid === 'status@broadcast') return
  const existing = session.chats.get(jid)
  session.chats.set(jid, {
    jid,
    name: name || existing?.name || jid.split('@')[0],
    isGroup,
    unread: extra.unread ?? existing?.unread ?? 0,
    lastMessageTime: extra.lastMessageTime ?? existing?.lastMessageTime ?? 0,
    participants: extra.participants ?? existing?.participants,
  })
}

function loadGroups(session: WASession): void {
  void session.sock
    .groupFetchAllParticipating()
    .then((groups) => {
      for (const [rawJid, meta] of Object.entries(groups)) {
        const jid = jidNormalizedUser(rawJid)
        recordChat(session, jid, meta.subject || jid, true, {
          participants: meta.participants?.length ?? 0,
        })
      }
      logger.debug('groups loaded', { accountId: session.accountId, count: Object.keys(groups).length })
    })
    .catch((err: unknown) => {
      logger.warn('failed to load groups', { accountId: session.accountId, err: String(err) })
    })
}

function wireMessageHandlers(session: WASession): void {
  const { sock, accountId } = session

  // Full history sync gives us all chats + contacts in one shot
  sock.ev.on('messaging-history.set', ({ chats, contacts }) => {
    for (const c of chats) {
      if (!c.id) continue
      const jid = jidNormalizedUser(c.id)
      const group = Boolean(isJidGroup(jid))
      const lastTs =
        typeof c.conversationTimestamp === 'number'
          ? c.conversationTimestamp * 1000
          : Number(c.conversationTimestamp ?? 0) * 1000 || 0
      recordChat(session, jid, c.name || jid.split('@')[0], group, {
        unread: c.unreadCount ?? 0,
        lastMessageTime: lastTs,
      })
    }
    for (const c of contacts) {
      if (!c.id) continue
      const jid = jidNormalizedUser(c.id)
      if (isJidGroup(jid)) continue
      recordChat(session, jid, c.name || c.notify || jid.split('@')[0], false)
    }
    loadGroups(session)
    logger.info('history synced', { accountId, chats: session.chats.size })
    broadcast({ type: 'chats_loaded', accountId, count: session.chats.size })
  })

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      if (!msg.key.remoteJid) continue
      const listener = incomingListeners.get(accountId)
      if (listener) {
        try {
          listener(msg)
        } catch (err) {
          logger.error('incoming listener failed', { accountId, err: String(err) })
        }
      }
    }
  })

  sock.ev.on('messages.update', (updates) => {
    for (const u of updates) {
      if (!u.key?.remoteJid) continue
      const rawStatus = u.update?.status
      if (rawStatus === undefined || rawStatus === null) continue
      let mapped: 'sent' | 'delivered' | 'read' | null = null
      if (rawStatus >= 3) mapped = 'sent'
      if (rawStatus >= 4) mapped = 'delivered'
      if (rawStatus >= 5) mapped = 'read'
      if (!mapped) continue
      broadcast({
        type: 'message_status',
        accountId,
        chatJid: jidNormalizedUser(u.key.remoteJid),
        messageId: u.key.id,
        status: mapped,
      })
    }
  })

  sock.ev.on('chats.upsert', (chats) => {
    for (const c of chats) {
      if (!c.id) continue
      const jid = jidNormalizedUser(c.id)
      recordChat(session, jid, c.name || jid.split('@')[0], Boolean(isJidGroup(jid)))
    }
  })

  sock.ev.on('chats.update', (updates) => {
    for (const c of updates) {
      if (!c.id) continue
      const jid = jidNormalizedUser(c.id)
      const existing = session.chats.get(jid)
      recordChat(session, jid, existing?.name || jid.split('@')[0], Boolean(isJidGroup(jid)), {
        unread: (c as { unreadCount?: number }).unreadCount ?? existing?.unread,
      })
    }
  })

  sock.ev.on('contacts.upsert', (contacts) => {
    for (const c of contacts) {
      if (!c.id) continue
      const jid = jidNormalizedUser(c.id)
      if (isJidGroup(jid)) continue
      recordChat(session, jid, c.name || c.notify || jid.split('@')[0], false)
    }
  })
}

/** Strip formatting and the international '+' so Baileys gets digits only. */
function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, '')
}

async function requestPairingCode(session: WASession): Promise<void> {
  const { accountId, pairingPhone } = session
  const log = logger.child({ accountId })
  if (!pairingPhone) return
  try {
    const phone = normalizePhone(pairingPhone)
    const code = await session.sock.requestPairingCode(phone)
    const formatted = code?.match(/.{1,4}/g)?.join('-') ?? code
    const acc = store.getAccount(accountId)
    if (acc) {
      acc.pairingCode = formatted
      acc.pairingPhone = phone
      acc.status = 'pairing'
      store.saveAccount(acc)
    }
    broadcast({ type: 'pairing_code', accountId, code: formatted, phone })
    setStatus(accountId, 'pairing')
    store.logActivity('account_connected', `Pairing code requested for +${phone}`, accountId)
    log.info('pairing code generated')
  } catch (err) {
    log.error('requestPairingCode failed', { err: String(err) })
    setStatus(accountId, 'error', { lastError: `Pairing code failed: ${String(err)}` })
    store.logError('wa', 'Failed to request pairing code', String(err), accountId)
    // allow a retry by re-requesting on the next QR trigger
    session.pairingRequested = false
  }
}

async function startConnection(accountId: string, opts: { pairingPhone?: string; reconnecting?: boolean } = {}): Promise<void> {
  const account = store.getAccount(accountId)
  if (!account) throw new Error('Account not found')
  if (sessions.has(accountId)) {
    const existing = sessions.get(accountId)!
    // Already live for this account — don't tear down a healthy session.
    if (existing.sock.user) return
    existing.closing = true
    try {
      existing.sock.end(undefined)
    } catch {
      /* ignore */
    }
    sessions.delete(accountId)
  }

  const sessionDir = resolve(config.sessionsDir, accountId)
  const log = logger.child({ accountId })
  setStatus(accountId, 'connecting')

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: undefined as unknown as [number, number, number],
    }))

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger(accountId)),
      },
      logger: baileysLogger(accountId),
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: true,
      generateHighQualityLinkPreview: false,
    })

    const session: WASession = {
      sock,
      accountId,
      qr: null,
      chats: new Map(),
      reconnecting: opts.reconnecting ?? false,
      closing: false,
      pairingPhone: opts.pairingPhone ?? null,
      pairingRequested: false,
    }
    sessions.set(accountId, session)
    wireMessageHandlers(session)

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        // In pairing mode we ask WhatsApp for a code instead of showing a QR.
        if (session.pairingPhone) {
          if (!session.pairingRequested) {
            session.pairingRequested = true
            void requestPairingCode(session)
          }
        } else {
          void QRCode.toDataURL(qr, { width: 320, margin: 2 })
            .then((dataUrl) => {
              session.qr = dataUrl
              const acc = store.getAccount(accountId)
              if (acc) {
                acc.qr = dataUrl
                acc.status = 'qr'
                store.saveAccount(acc)
              }
              broadcast({ type: 'qr', accountId, qr: dataUrl })
              setStatus(accountId, 'qr')
              log.info('QR generated')
            })
            .catch((err: unknown) => log.error('QR encode failed', { err: String(err) }))
        }
      }

      if (connection === 'open') {
        session.qr = null
        const me = sock.user
        const jid = me?.id ? jidNormalizedUser(me.id) : null
        setStatus(accountId, 'connected', {
          qr: null,
          pairingCode: null,
          pairingPhone: null,
          jid,
          pushName: me?.name ?? null,
          connectedAt: Date.now(),
          lastError: null,
        })
        store.logActivity('account_connected', `Account connected${me?.name ? ` as ${me.name}` : ''}`, accountId)
        log.info('connected', { jid, name: me?.name })
        broadcast({ type: 'account_connected', accountId, jid, pushName: me?.name ?? null })
        loadGroups(session)
      }

      if (connection === 'close') {
        const statusCode = new Boom(lastDisconnect?.error as Error)?.output?.statusCode
        const loggedOut = statusCode === DisconnectReason.loggedOut

        if (session.closing || loggedOut) {
          setStatus(accountId, 'disconnected', { qr: null })
          if (loggedOut) {
            store.logActivity('account_disconnected', 'Account logged out – session removed', accountId)
            log.warn('logged out')
          }
          sessions.delete(accountId)
          return
        }

        if (store.data.settings.autoReconnect) {
          if (session.reconnecting) return
          session.reconnecting = true
          log.warn('connection closed, reconnecting', { statusCode })
          setStatus(accountId, 'connecting', { lastError: `Connection lost (${statusCode ?? 'unknown'})` })
          setTimeout(() => {
            void startConnection(accountId, { reconnecting: true }).catch((err: unknown) => {
              log.error('reconnect failed', { err: String(err) })
              setStatus(accountId, 'error', { lastError: String(err) })
              store.logError('wa', 'Reconnect failed', String(err), accountId)
            })
          }, 3000 + Math.random() * 2000)
        } else {
          setStatus(accountId, 'disconnected', { lastError: `Connection closed (${statusCode ?? 'unknown'})` })
          store.logActivity('account_disconnected', 'Account disconnected', accountId)
          sessions.delete(accountId)
        }
      }
    })
  } catch (err) {
    log.error('start connection failed', { err: String(err) })
    setStatus(accountId, 'error', { lastError: String(err) })
    store.logError('wa', 'Failed to start connection', String(err), accountId)
    sessions.delete(accountId)
    throw err
  }
}

export const waManager = {
  async connect(accountId: string): Promise<void> {
    await startConnection(accountId)
  },

  /**
   * Link using a phone number instead of scanning a QR code. WhatsApp shows an
   * 8-digit code on the phone (Linked devices → Link with phone number).
   */
  async pairWithPhone(accountId: string, phone: string): Promise<void> {
    const account = store.getAccount(accountId)
    if (!account) throw new Error('Account not found')
    const clean = normalizePhone(phone)
    // E.164 without '+' is typically 8–15 digits.
    if (clean.length < 8 || clean.length > 15) {
      throw new Error('Enter the full number with country code (8-15 digits)')
    }
    const acc = store.getAccount(accountId)
    if (acc) {
      acc.pairingPhone = clean
      acc.pairingCode = null
      store.saveAccount(acc)
    }
    await startConnection(accountId, { pairingPhone: clean })
  },

  async disconnect(accountId: string): Promise<void> {
    const session = sessions.get(accountId)
    if (session) {
      session.closing = true
      try {
        session.sock.end(undefined)
      } catch {
        /* ignore */
      }
      sessions.delete(accountId)
    }
    setStatus(accountId, 'disconnected', { qr: null, pairingCode: null, pairingPhone: null })
    store.logActivity('account_disconnected', 'Account disconnected by user', accountId)
  },

  async removeAccount(accountId: string): Promise<void> {
    const session = sessions.get(accountId)
    if (session) {
      session.closing = true
      try {
        await session.sock.logout()
      } catch {
        /* may already be logged out */
      }
      try {
        session.sock.end(undefined)
      } catch {
        /* ignore */
      }
      sessions.delete(accountId)
    }
    try {
      rmSync(resolve(config.sessionsDir, accountId), { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    store.deleteAccount(accountId)
  },

  async sendText(accountId: string, jid: string, text: string): Promise<string> {
    const session = sessions.get(accountId)
    if (!session) throw new Error('Account not connected')
    if (!session.sock.user) throw new Error('Account socket not ready')
    const result = await session.sock.sendMessage(jid, { text } as AnyMessageContent)
    return result?.key?.id ?? ''
  },

  async getChats(accountId: string): Promise<ChatInfo[]> {
    const session = sessions.get(accountId)
    if (!session) return []
    loadGroups(session)
    return Array.from(session.chats.values()).sort((a, b) => b.lastMessageTime - a.lastMessageTime)
  },

  isConnected(accountId: string): boolean {
    const session = sessions.get(accountId)
    return Boolean(session?.sock.user)
  },

  getSocket(accountId: string): WASocket | undefined {
    return sessions.get(accountId)?.sock
  },

  onIncoming(accountId: string, fn: (msg: WAMessage) => void): void {
    incomingListeners.set(accountId, fn)
  },

  offIncoming(accountId: string): void {
    incomingListeners.delete(accountId)
  },

  onStatus(fn: (accountId: string, status: Account['status']) => void): void {
    statusListeners.add(fn)
  },

  async shutdown(): Promise<void> {
    for (const [id, session] of sessions) {
      session.closing = true
      try {
        session.sock.end(undefined)
      } catch {
        /* ignore */
      }
      sessions.delete(id)
    }
  },
}
