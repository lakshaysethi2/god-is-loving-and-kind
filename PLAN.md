# PLAN.md — Improvement Backlog

Prioritized (P0 = must do, P1 = should do, P2 = nice to have).

## P0 — Critical

- [ ] **P0.1 — Tests for core logic.** No test coverage exists. Write unit tests for:
  - `verifySignature()` (valid HMAC, invalid HMAC, missing header, wrong format, timing safety)
  - `processMessages()` (echo skip, message types, missing sender, malformed payloads)
  - `sendMessage()` (success path, API error, network error)
  - HTTP handlers: `GET /webhook` (valid verify, invalid token, missing params), `POST /webhook` (valid payload, bad signature, non-page object)
- [ ] **P0.2 — Serial `await` in `processMessages` can cause blocking and partial failure.**
  Each message is `await`ed sequentially. If one `sendMessage` rejects, the rest are dropped. Switch to `Promise.allSettled` with per-message error handling so all messages get attempted independently.
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
