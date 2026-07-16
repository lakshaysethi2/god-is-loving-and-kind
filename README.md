# God Is Loving And Kind — Messenger Bot

A Facebook Messenger chatbot that replies **"god is loving and kind"** to every message in group chats and direct conversations.

## Features

- **Group & DM support** — responds in both 1:1 conversations and group threads
- **All message types** — replies to text, images, stickers, GIFs, files, audio, video, location shares, and postbacks
- **HMAC signature verification** — validates every webhook payload using your Facebook App Secret
- **Echo loop prevention** — filters out the bot's own outbound messages
- **Per-recipient rate limiting** — sliding-window limiter prevents hitting Facebook API tier limits (200 msg/user/60s)
- **Typing indicator** — sends `typing_on` before each reply for a natural feel
- **Structured logging** — JSON log output via [pino](https://getpino.io) (pretty-print in dev)
- **Enhanced healthcheck** — reports uptime and message stats via `GET /`
- **Graceful shutdown** — handles `SIGTERM`/`SIGINT` cleanly
- **Containerized** — multi-stage Docker build with layer caching, healthcheck, and non-root user

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) 22+
- [Docker](https://docker.com) + [Docker Compose](https://docs.docker.com/compose/) (optional)
- [ngrok](https://ngrok.com) (for local HTTPS testing)
- A [Facebook Developer](https://developers.facebook.com) account with a **Page** and **App**

### Setup

```bash
# 1. Clone and install
git clone https://github.com/lakshaysethi2/god-is-loving-and-kind.git
cd god-is-loving-and-kind
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your Facebook tokens (see .env.example for details)

# 3. Run in dev mode (hot-reload)
npm run dev
```

### Docker

```bash
# Build and start
make start

# Or manually:
docker compose up -d --build

# Follow logs
make logs
```

### Facebook App Configuration

1. Go to [developers.facebook.com](https://developers.facebook.com) → your App → **Messenger** → **Settings**
2. Generate a **Page Access Token** and copy your **App Secret**
3. Set `PAGE_ACCESS_TOKEN` and `APP_SECRET` in `.env`
4. Set `VERIFY_TOKEN` to any random string
5. Start the bot and expose it with ngrok: `ngrok http 3000`
6. In the Facebook App dashboard, add a **Callback URL**:
   - **URL**: `https://your-ngrok-url.ngrok.io/webhook`
   - **Verify Token**: the value you chose
7. Subscribe to `messages` and `messaging_postbacks` fields

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP server port |
| `VERIFY_TOKEN` | **Yes** | — | Secret string for webhook handshake |
| `PAGE_ACCESS_TOKEN` | **Yes** | — | Facebook Page access token |
| `APP_SECRET` | **Yes** | — | Facebook App Secret for HMAC verification |
| `GRAPH_API_VERSION` | No | `v21.0` | Facebook Graph API version |
| `RATE_LIMIT_MAX_PER_WINDOW` | No | `200` | Max outbound messages per user per window |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate-limit window in milliseconds |
| `LOG_LEVEL` | No | `info` | Pino log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace` |

## Project Structure

```
├── Dockerfile                 # Multi-stage Docker build
├── Makefile                   # Docker Compose shortcuts
├── docker-compose.yml         # Service orchestration
├── .env.example               # Environment variable template
├── eslint.config.mjs          # ESLint flat config (v10)
├── .prettierrc.json           # Prettier code style
├── .editorconfig              # Editor defaults
├── .nvmrc / .node-version     # Node.js version pinning (22)
├── src/
│   ├── index.js               # Express server, routes, shutdown
│   ├── logger.js              # Pino logger (pretty in dev, JSON in prod)
│   ├── messenger.js           # Core bot logic (send, process, validate)
│   ├── ratelimit.js           # Per-recipient sliding-window rate limiter
│   ├── status.js              # In-process uptime/statistics tracker
│   └── verify.js              # HMAC-SHA256 webhook signature check
└── test/
    ├── messenger.test.js      # 31 tests: send, process, typing, rate-limit, validation
    ├── ratelimit.test.js      # 9 tests: window, pruning, cleanup, independent users
    ├── shutdown.test.js       # 2 tests: SIGTERM, SIGINT
    ├── status.test.js         # 3 tests: counters, snapshots
    └── verify.test.js         # 11 tests: valid, invalid, edge cases
```

## Scripts

| Command | Description |
|---|---|
| `npm start` | Start the bot |
| `npm run dev` | Start with hot-reload (`node --watch`) |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Check code style (ESLint) |
| `npm run format` | Check formatting (Prettier) |
| `npm run check` | Full CI check: lint + format + test |

## Testing

The project uses Node's built-in test runner (`node:test`). No additional test framework is needed.

```bash
# Run all tests
npm test

# Run a single test file
node --test test/verify.test.js

# Run tests with the full CI check (lint + format + test)
npm run check
```

**Test summary** — 56 tests across 5 test files:

| File | Tests | Coverage |
|---|---|---|
| `test/verify.test.js` | 11 | HMAC verification edge cases |
| `test/messenger.test.js` | 31 | Send, process, typing indicator, rate limit, payload validation |
| `test/ratelimit.test.js` | 9 | Window, pruning, independent users, dispose |
| `test/status.test.js` | 3 | Counters, snapshot semantics |
| `test/shutdown.test.js` | 2 | SIGTERM, SIGINT graceful shutdown |

## Makefile Commands

```bash
make build     # Build Docker image
make up        # Start container (daemon)
make down      # Stop container
make logs      # Tail logs
make restart   # Restart container
make shell     # Open shell in container
make clean     # Full teardown (image + container)
make start     # Build & start (one-shot)
```

## Architecture

```
Facebook Messenger
      │
      ▼  HTTPS POST (webhook payload)
 ┌──────────┐
 │  Express  │  → verifySignature() → validateWebhookPayload()
 │  Server   │
 └────┬─────┘
      │  Fire-and-forget (returns 200 immediately)
      ▼
 ┌───────────┐
 │processMsgs│  → rateLimiter.tryConsume() per recipient
 └─────┬─────┘
       │  Promise.allSettled (concurrent per recipient)
       ├──── sendTypingIndicator()  →  POST sender_action: typing_on
       └──── sendMessage()          →  POST message: "god is loving and kind"
```

## License

MIT
