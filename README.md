# WhatsApp Automation Dashboard

A self-hosted dashboard for managing WhatsApp accounts, sending messages, and
running keyword auto-replies — built to run entirely on an Android phone via
Termux.

- **Backend:** Node.js + TypeScript, [Baileys](https://github.com/WhiskeySockets/Baileys),
  Express, `ws`, SQLite-free JSON persistence (no native deps).
- **Frontend:** React + TypeScript + Vite + Tailwind CSS.
- **Transport:** REST + WebSocket for real-time status/QR/notifications.

> ⚠️ **Baileys is an unofficial WhatsApp Web library.** It is not affiliated
> with WhatsApp/Meta. Automating WhatsApp can lead to account restrictions or
> bans. Use accounts you own, keep volumes human-like, and read the
> [Compatibility & risks](#compatibility--risks) section before use.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [Project layout](#project-layout)
4. [Termux installation](#termux-installation)
5. [Running](#running)
6. [Keeping it alive](#keeping-it-alive)
7. [Data directory, backup & restore](#data-directory-backup--restore)
8. [Configuration (.env)](#configuration-env)
9. [Security model](#security-model)
10. [AI integration](#ai-integration)
11. [Compatibility & risks](#compatibility--risks)
12. [Deno note](#deno-note)
13. [API reference](#api-reference)
14. [Troubleshooting](#troubleshooting)

---

## What it does

| Page | Description |
|------|-------------|
| **Overview** | Live stats from real data: connected accounts, rule counts, messages sent today, recent activity & errors, quick actions. |
| **WhatsApp Accounts** | Create/remove accounts, link via **QR code or phone-number pairing code**, live status, linked account info, reconnect/disconnect. Multiple accounts supported. |
| **Messaging** | Pick an account, load & search chats/groups, compose single or multi-message sequences with configurable delays, preview, send-status, cancel running sequences. Multi-recipient sends require confirmation. |
| **Auto-Reply Rules** | Keyword rules with exact/contains/case-insensitive matching, multiple replies, one-vs-all reply mode, inter-reply delay, per-account and per-chat targeting, cooldown, priority, enable toggle. |
| **AI Integration** | Optional. Provider adapter (OpenAI-compatible + Anthropic), endpoint, masked API key, model, system prompt, max tokens, temperature, test button, enable/disable, group-specific settings. |
| **Message History** | Sent / incoming / auto-reply messages with delivery status, plus activity log and error log. |
| **Settings** | Rate limits, loop-protection caps, reconnect behaviour, group/individual toggles, incoming logging, API-token regeneration. |

---

## Architecture

```
frontend (Vite dev server :5173, or built into backend :3456)
        │  REST  /api/*            WebSocket  /ws
        ▼
backend (Express :3456, Node.js)
  ├── routes/         REST endpoints (auth-guarded)
  ├── ws.ts           WebSocket broadcast service
  ├── store.ts        JSON persistence (atomic writes, debounced save)
  ├── auth.ts         Bearer-token auth (timing-safe compare)
  ├── logger.ts       Structured console + file logs
  ├── wa/manager.ts   Baileys connection manager (multi-account)
  └── services/
        ├── auto-reply.ts  keyword engine + loop protection
        ├── sender.ts      single/sequence sending + rate limit
        └── ai.ts          provider adapters
```

**Real-time events** (WebSocket): `account_status`, `qr`, `pairing_code`,
`account_connected`, `chats_loaded`, `message_sent`, `message_status`,
`message_incoming`, `auto_reply`, `sequence_start`, `sequence_progress`,
`sequence_done`, `rule_changed`, `ai_config_changed`, `settings_changed`.

---

## Project layout

```
wabit/
├── backend/
│   ├── src/
│   │   ├── index.ts            # server bootstrap
│   │   ├── config.ts           # env + paths
│   │   ├── logger.ts           # structured logging
│   │   ├── store.ts            # persistence layer
│   │   ├── auth.ts             # token auth middleware
│   │   ├── ws.ts               # WebSocket service
│   │   ├── types.ts            # shared types
│   │   ├── wa/manager.ts       # Baileys connection manager
│   │   ├── routes/             # accounts, messages, rules, ai, system
│   │   └── services/           # auto-reply, sender, ai
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.tsx, main.tsx, index.css
│   │   ├── components/         # ui.tsx, Layout.tsx
│   │   ├── lib/                # api.ts, ws.ts, store.ts, types.ts
│   │   └── pages/              # 7 pages
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
└── README.md
```

---

## Termux installation

Tested on Termux (aarch64) with Node 20 and Deno 2.8. Android's Termux ships a
recent Node, so **no NodeSource / Docker / native build tools are required.**

### 1. Install prerequisites

```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts git
# optional but recommended
pkg install -y termux-api
```

Verify:

```bash
node -v    # v20.x or newer
npm -v     # 9.x or newer
```

> If `node -v` shows something older than 20, run `pkg upgrade nodejs-lts`.

### 2. Get the code

```bash
cd ~
git clone <your-repo-url> wabit      # or copy the wabit/ folder here
cd wabit
```

### 3. Install backend dependencies

```bash
cd ~/wabit/backend
npm install --no-audit --no-fund
cd ..
```

### 4. Install frontend dependencies

```bash
cd ~/wabit/frontend
npm install --no-audit --no-fund
cd ..
```

> **Termux tip:** if `npm install` fails with `ENOENT ... _cacache/tmp`, your
> home cache is on a filesystem that doesn't support atomic rename (common in
> PRoot). Point the cache at `/tmp` (shared storage):
>
> ```bash
> npm install --cache /tmp/npm-cache --fetch-timeout 120000 --no-audit --no-fund
> ```
>
> If a fetch times out, simply re-run the command — npm resumes from cache.

---

## Running

### Development (hot reload)

Two terminals.

```bash
# Terminal 1 – backend API + WhatsApp engine
cd ~/wabit/backend
cp .env.example .env          # first time only; edit if you like
npx tsc && node dist/index.js

# Terminal 2 – frontend with proxy to the backend
cd ~/wabit/frontend
npm run dev
```

Open **http://127.0.0.1:5173** in your phone's browser.

### Production (single port)

Build the frontend; the backend then serves it automatically.

```bash
# build once (re-run after frontend changes)
cd ~/wabit/frontend
npm run build                 # outputs frontend/dist

# start backend (serves API + the built dashboard on one port)
cd ~/wabit/backend
npx tsc
node dist/index.js
```

Open **http://127.0.0.1:3456**.

### First sign-in

On first start the backend generates an **API token** and prints a shortened
form to the console. The full token is in `backend/data/store.json`:

```bash
cd ~/wabit/backend
node -e "console.log(JSON.parse(require('fs').readFileSync('data/store.json')).apiToken)"
```

Paste that token into the dashboard login screen. To pin your own token, set
`API_TOKEN` in `backend/.env` before first start.

### Linking a WhatsApp account

Two methods are supported, both from the **WhatsApp Accounts** page:

1. **QR code** — press **Connect via QR**, then scan from
   *WhatsApp → Linked devices → Link a device*.
2. **Phone number (pairing code)** — press **Use phone number**, enter the
   account's number with country code (e.g. `2348012345678`, no `+`), and
   WhatsApp displays an 8-digit code. On the phone open
   *Settings → Linked devices → Link a device → Link with phone number instead*
   and type the code.

The pairing code is short-lived and only visible while the account status is
`pairing`; it is cleared on disconnect. Pairing mode suppresses the QR entirely.

---

## Keeping it alive

Termux kills background processes when Android reclaims memory. Recommended
approaches, from simplest to most robust:

### Option A — `termux-wake-lock` (minimum)

Prevents the CPU from sleeping. Run once per session:

```bash
termux-wake-lock
cd ~/wabit/backend && node dist/index.js
```

### Option B — `nohup` + `wake-lock` (survives terminal close)

```bash
termux-wake-lock
cd ~/wabit/backend
nohup node dist/index.js > ~/wabit/backend/data/logs/server.out 2>&1 &
echo $! > ~/wabit/backend/server.pid
```

Stop it later with `kill "$(cat ~/wabit/backend/server.pid)"`.

### Option C — a `run.sh` helper

Create `~/wabit/run.sh`:

```bash
#!/data/data/com.termux/files/usr/bin/bash
set -e
cd "$(dirname "$0")"

# rebuild frontend if missing, then start backend
[ -d frontend/dist ] || (cd frontend && npm run build)

termux-wake-lock 2>/dev/null || true
cd backend
exec node dist/index.js
```

```bash
chmod +x ~/wabit/run.sh
~/wabit/run.sh
```

### Option D — Termux:Boot (auto-start after reboot)

1. Install the **Termux:Boot** app from F-Droid (not Play Store).
2. Launch it once so it can register.
3. Create `~/.termux/boot/wa-dashboard.sh`:

   ```bash
   #!/data/data/com.termux/files/usr/bin/sh
   termux-wake-lock
   termux-notification --title "WA Dashboard" --content "Starting server…" 2>/dev/null
   cd ~/wabit && ./run.sh >> ~/wabit/backend/data/logs/boot.log 2>&1
   ```

4. `chmod +x ~/.termux/boot/wa-dashboard.sh`

### Graceful restart behaviour

There is no way to guarantee a process survives Android's aggressive memory
reclamation. What the app *does* guarantee:

- **Sessions persist.** Baileys auth files live in `data/sessions/`. After a
  restart, accounts are marked `disconnected` and can be reconnected with one
  tap — **no re-scan is needed** unless WhatsApp logged you out.
- **Auto-reconnect** (Settings) reconnects on network drops while running.
- **Pending sequences** are not resumed after a crash (they are in-memory); the
  compose UI shows this clearly.

---

## Data directory, backup & restore

All runtime state lives under `backend/data/` (override with `DATA_DIR`):

```
backend/data/
├── store.json          # accounts, rules, AI config, settings, API token, activity
├── messages.jsonl      # message history (append-only JSONL)
├── sessions/           # Baileys auth per account  ← SENSITIVE
└── logs/app.log        # structured log
```

### Backup

```bash
termux-wake-lock        # not required, just avoids interruption
cd ~/wabit/backend
tar czf ~/wa-backup-$(date +%Y%m%d).tgz data/
```

Copy it off-device:

```bash
# share via Termux API, or copy to shared storage:
cp ~/wa-backup-*.tgz /sdcard/Download/    # needs termux-setup-storage first
```

### Restore

Stop the server, then:

```bash
cd ~/wabit/backend
rm -rf data
tar xzf ~/wa-backup-YYYYMMDD.tgz
node dist/index.js
```

Restoring `sessions/` restores WhatsApp logins, so the dashboard comes back
already signed in (unless WhatsApp invalidated the session server-side).

---

## Configuration (.env)

Copy `backend/.env.example` to `backend/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `127.0.0.1` | Bind address. Keep loopback unless you intend LAN access. |
| `PORT` | `3456` | Backend port. |
| `DATA_DIR` | `./data` | Where sessions/store/logs are written. Use an absolute path on Termux if you prefer. |
| `API_TOKEN` | *(generated)* | Pin the dashboard/API token. Generated randomly if unset. |
| `LOG_LEVEL` | `info` | `trace`/`debug`/`info`/`warn`/`error`. |

---

## Security model

- **Localhost only by default.** The server binds `127.0.0.1`. Changing `HOST`
  exposes the API — the token is then the only barrier.
- **Token auth on every sensitive endpoint** and on the WebSocket handshake.
  Comparison is timing-safe.
- **Secrets never reach the browser.** Session files stay in `data/sessions/`;
  AI keys are stored server-side and only returned masked (`sk-t…3456`). Keys
  are never logged and never placed in `localStorage` (the token uses
  `sessionStorage` and clears on tab close).
- **Input validation** on every mutating route (lengths, enums, numeric
  ranges).
- **No fabricated state.** Connection status comes from Baileys events;
  message delivery status comes from `messages.update`. If WhatsApp doesn't
  report it, the UI shows `sent`, not `delivered`.
- **Duplicate-send protection.** Manual sends are rate-limited per chat; the
  UI disables the send button while a request is in flight.
- **Loop protection.** Bot-sent messages are ignored, per-chat auto-reply rate
  is capped, and rules support cooldowns.

---

## AI integration

AI is entirely optional — keyword rules work without it.

1. Go to **AI Integration**.
2. Pick a provider (OpenAI-compatible or Anthropic), set the endpoint, model
   and API key.
3. Click **Test connection**.
4. Enable **AI replies** (and optionally **AI in groups**).

The OpenAI-compatible adapter also works with OpenRouter, Groq, Together,
Ollama (`http://localhost:11434/v1`), LM Studio and vLLM — anything exposing
`/chat/completions`. Add new providers by implementing the `ProviderAdapter`
interface in `backend/src/services/ai.ts`.

Order of processing for each incoming message: **keyword rules first** (highest
priority match wins); AI only runs if no rule matched and AI is enabled.

---

## Compatibility & risks

- **Unofficial.** Baileys reverse-engineers WhatsApp Web. WhatsApp may change
  its protocol at any time, which can break connections until Baileys updates.
- **Account restrictions.** Bulk/automated messaging violates WhatsApp's Terms
  and can get a number banned. This app deliberately ships **no** bulk/unsolicited
  sender and **no** ban-evasion features. Keep delays realistic, target chats
  you have permission to message, and use a secondary number while testing.
- **Session invalidation.** If WhatsApp logs the device out, the saved session
  is rejected; you must link again (QR or phone number). The app shows this as
  `logged out`.
- **Pairing codes are the same unofficial path.** The phone-number method is a
  convenience over scanning — it carries identical risk and still links a device
  through the same unsupported Baileys flow. Rate limits / lockouts may apply if
  you request codes repeatedly.
- **Multiple accounts.** Each account is an independent linked device. More
  accounts = more surface for restrictions.
- **History sync.** Chat/group lists come from WhatsApp's history sync and can
  be incomplete, especially on a fresh link; open WhatsApp on the phone if the
  list looks sparse.

---

## Deno note

Deno 2.x is available on Termux and is a great runtime, but **Deno's npm
compatibility layer cannot reliably run the Vite build toolchain**: its npm
installer does not extract bin shims (e.g. `vite/bin/vite.js`) or all transitive
dependencies (e.g. rollup), so `deno run vite build` fails here. To keep the
build reproducible on Termux we use the standard **npm** toolchain for both the
frontend and the backend, while keeping all application code 100 % TypeScript.

Everything the app itself does at runtime (the frontend it serves and the
backend) runs on Node — there is no Deno dependency at runtime. If you want to
experiment with Deno, you can run individual TypeScript scripts with
`deno run`, but the build/serve flow documented above uses npm.

---

## API reference

All routes are under `/api` and require `Authorization: Bearer <token>`
(except `/api/login` and `/api/health`).

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/login` | Validate a token |
| GET | `/health` | Liveness |
| GET | `/overview` | Dashboard stats |
| GET | `/activity` | Activity log |
| GET | `/errors` · DELETE `/errors` | Error log |
| GET/PUT | `/settings` | App settings |
| POST | `/settings/regenerate-token` | Rotate API token |
| GET/POST | `/accounts` | List / create accounts |
| GET/DELETE | `/accounts/:id` | Get / remove account |
| POST | `/accounts/:id/connect` · `/disconnect` | Connect (QR) / disconnect |
| POST | `/accounts/:id/pair` | Link via phone-number pairing code (`{ phone }`) |
| GET | `/accounts/:id/chats` | Chats & groups |
| POST | `/messages/send` | Send one message |
| POST | `/messages/sequence` | Start a sequence (confirmation required for >1) |
| POST | `/messages/sequence/:id/cancel` | Cancel a running sequence |
| GET | `/messages/sequences` | List sequences |
| GET | `/messages/history` | Message history |
| GET/POST | `/rules` | List / create rules |
| PUT/DELETE | `/rules/:id` | Update / delete rule |
| POST | `/rules/:id/toggle` | Enable / disable |
| GET/PUT/DELETE | `/ai/config` | AI configuration |
| GET | `/ai/providers` | Available providers |
| POST | `/ai/test` | Test AI connection |
| PUT | `/ai/enable` | Toggle AI replies |

WebSocket: `ws://127.0.0.1:3456/ws?token=<token>`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `EADDRINUSE` | Another instance is running: `pkill -f dist/index.js` then restart. |
| Dashboard shows “Offline” in the sidebar | WebSocket couldn't authenticate; sign out and back in with a fresh token. |
| QR never appears | Ensure the account status is `connecting`; check `data/logs/app.log`. If it stays `error`, the network or Baileys version is at fault. |
| Chats/groups list is empty | Open WhatsApp on the phone to trigger history sync, then reload. |
| `npm install` fails with cache errors | Use `--cache /tmp/npm-cache` (see install notes). |
| Login rejects the token | Read it exactly from `data/store.json`; regenerate via Settings if lost. |
| WhatsApp logs you out repeatedly | Remove and re-create the account (deletes the session), then re-scan. |

Logs are also viewable in the app under **Message History → Errors** and in
`backend/data/logs/app.log`.

---

## License

Provided as-is for personal use. You are responsible for complying with
WhatsApp's Terms of Service and all applicable laws.
