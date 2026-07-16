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
- [ ] **P1.3 — `.nvmrc` / `.node-version` file.** Pin the Node.js version for local dev to match the Docker image (22).
- [ ] **P1.3 — `.nvmrc` / `.node-version` file.** Pin the Node.js version for local dev to match the Docker image (22).
- [ ] **P1.4 — Logging improvements.** Replace `console.log/warn/error` with a structured logger (pino) that includes request IDs, recipient IDs, and JSON-structured output for log aggregation.

## Discovered during reviews

- [x] **R1 — Error logging lost during refactor.** ✅ Fixed in Iteration 1 (added `.catch` with `console.error` in processMessages).
- [x] **R2 — Dead code in `processMessages` return.** ✅ Fixed (removed `r.reason` fallback, each promise handles its own error).
- [x] **R3 — `processMessages(null)` crash.** ✅ Fixed (null guard added).
- [x] **R4 — `.gitignore` lockfile comment misleading.** ✅ Fixed (now says "committed for reproducibility").
- [x] **R5 — Test pollution from rate limiter state between describe blocks.** ✅ Fixed (added `after()` cleanup in rate-limiting tests).
- [x] **R6 — `_pruneRecipient` left empty arrays in Map.** ✅ Fixed (now deletes the key when all timestamps expire).

## P2 — Nice to Have

- [ ] **P2.1 — Graceful shutdown test.** The shutdown handler exists but is untested.
- [ ] **P2.2 — Healthcheck endpoint returns app status.** Currently just a static string. Could report uptime, last message processed timestamp, error counts.
- [ ] **P2.3 — CI workflow (GitHub Actions).** Run tests + lint on every push.
- [ ] **P2.4 — Send typing indicator.** Before replying, send the `typing_on` sender action so users see the bot is "typing".
- [ ] **P2.5 — README.** Add setup, testing, and deployment documentation.
