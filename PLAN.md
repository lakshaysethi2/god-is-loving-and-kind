# PLAN.md — Improvement Backlog

Prioritized (P0 = must do, P1 = should do, P2 = nice to have).

## P0 — Critical

- [x] **P0.1 — Tests for core logic.** ✅ Done (Iteration 1).
  - `verifySignature()` — 11 tests covering valid, invalid, missing params, wrong format, timing safety
  - `processMessages()` — 13 tests covering echo skip, message types (text, image, sticker, postback), missing sender, empty/malformed payloads, concurrent sends, partial failure
  - `sendMessage()` — 3 tests covering success path, API error, configured version
- [x] **P0.2 — Serial `await` in `processMessages`.** ✅ Fixed during the extract-refactor in Iteration 1.
  Using `Promise.allSettled` with per-message `.catch()` — one failure doesn't block others.
- [x] **P0.3 — Rate-limiting / send queue.** ✅ Done (Iteration 2).
  `RateLimiter` class with per-recipient sliding window, integrated into `processMessages`. Configured via env vars. Automatic stale-entry cleanup.

## P1 — Should Do

- [x] **P1.1 — Schema/input validation.** ✅ Done (Iteration 3).
  Added `validateWebhookPayload()` — structural validation with descriptive error messages. Integrated into the HTTP handler. 11 tests.
- [x] **P1.2 — ESLint + Prettier configuration.** ✅ Done (Iteration 4).
  Added `eslint.config.mjs` (flat config, ESLint v10), `.prettierrc.json`, `.editorconfig`, npm scripts (`lint`, `format`, `check`). Auto-fixed all 31 lint/format issues across all source and test files.
- [x] **P1.3 — `.nvmrc` / `.node-version` file.** ✅ Done (Iteration 5).
  Pins Node.js 22 for local dev tooling, matching the Docker image and `engines` field.
- [x] **P1.4 — Logging improvements.** ✅ Done (Iteration 6).
  Added `src/logger.js` wrapping pino with pretty-print in dev, JSON in prod. Replaced all `console.*` calls with structured `logger.*` calls that include request context.

## Discovered during reviews

- [x] **R1 — Error logging lost during refactor.** ✅ Fixed in Iteration 1 (added `.catch` with `console.error` in processMessages).
- [x] **R2 — Dead code in `processMessages` return.** ✅ Fixed (removed `r.reason` fallback, each promise handles its own error).
- [x] **R3 — `processMessages(null)` crash.** ✅ Fixed (null guard added).
- [x] **R4 — `.gitignore` lockfile comment misleading.** ✅ Fixed (now says "committed for reproducibility").
- [x] **R5 — Test pollution from rate limiter state between describe blocks.** ✅ Fixed (added `after()` cleanup in rate-limiting tests).
- [x] **R6 — `_pruneRecipient` left empty arrays in Map.** ✅ Fixed (now deletes the key when all timestamps expire).

## P2 — Nice to Have

- [x] **P2.1 — Graceful shutdown test.** ✅ Done (Iteration 9).
  Integration tests verifying SIGTERM/SIGINT both produce clean exit code 0. Spawns the server, probes health endpoint, sends signal, asserts exit.
- [x] **P2.2 — Healthcheck endpoint returns app status.** ✅ Done (Iteration 7).
  Added `src/status.js` tracking uptime, sent/success/failure/rate-limited counts. `/` endpoint returns JSON with `{ ok, message, uptimeMs, stats }`.
- [x] **P2.3 — CI workflow (GitHub Actions).** ⛔ BLOCKED — see BLOCKED.md.
- [x] **P2.4 — Send typing indicator.** ✅ Done (Iteration 10).
  Added `sendTypingIndicator()` that sends `sender_action: "typing_on"` before each reply. Errors are non-blocking.
- [x] **P2.5 — README.** ✅ Done (Iteration 11).
  Comprehensive README covering setup, testing, Docker deployment, architecture, environment variables, scripts, and project structure.
