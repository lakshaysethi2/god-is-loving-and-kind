# PLAN.md — Improvement Backlog

Prioritized (P0 = must do, P1 = should do, P2 = nice to have).

## P0 — Critical

- [x] **P0.1 — Tests for core logic.** ✅ Done (Iteration 1).
  - `verifySignature()` — 11 tests covering valid, invalid, missing params, wrong format, timing safety
  - `processMessages()` — 13 tests covering echo skip, message types (text, image, sticker, postback), missing sender, empty/malformed payloads, concurrent sends, partial failure
  - `sendMessage()` — 3 tests covering success path, API error, configured version
- [x] **P0.2 — Serial `await` in `processMessages`.** ✅ Fixed during the extract-refactor in Iteration 1.
  Using `Promise.allSettled` with per-message `.catch()` — one failure doesn't block others.
- [ ] **P0.3 — Rate-limiting / send queue.** In a busy group, concurrent `Promise.allSettled` could hit Facebook API rate limits (200 calls/user/60s tier). Add a simple in-memory token-bucket or sliding-window rate limiter per recipient.

## P1 — Should Do

- [ ] **P1.1 — Schema/input validation for webhook payloads.** The handler trusts `body.entry` and `entry.messaging` structure. Malformed or unexpected payloads could crash `processMessages` or silently skip events. Add defensive validation.
- [ ] **P1.2 — ESLint + Prettier configuration.** No code-style tooling. Add `.eslintrc.json`, `.prettierrc`, and a `lint` npm script. Run lint in CI.
- [ ] **P1.3 — `.nvmrc` / `.node-version` file.** Pin the Node.js version for local dev to match the Docker image (22).
- [ ] **P1.4 — Logging improvements.** Replace `console.log/warn/error` with a structured logger (pino) that includes request IDs, recipient IDs, and JSON-structured output for log aggregation.

## P2 — Nice to Have

- [ ] **P2.1 — Graceful shutdown test.** The shutdown handler exists but is untested.
- [ ] **P2.2 — Healthcheck endpoint returns app status.** Currently just a static string. Could report uptime, last message processed timestamp, error counts.
- [ ] **P2.3 — CI workflow (GitHub Actions).** Run tests + lint on every push.
- [ ] **P2.4 — Send typing indicator.** Before replying, send the `typing_on` sender action so users see the bot is "typing".
- [ ] **P2.5 — README.** Add setup, testing, and deployment documentation.
