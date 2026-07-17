const express = require("express");

const { verifySignature } = require("./verify");
const { configure, processMessages, validateWebhookPayload } = require("./messenger");
const logger = require("./logger");
const { getStatus } = require("./status");

const app = express();

// ---------------------------------------------------------------------------
// Configuration from environment variables
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const APP_SECRET = process.env.APP_SECRET;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v21.0";

// Rate-limit settings (optional, with sensible defaults)
const RATE_LIMIT_RAW = process.env.RATE_LIMIT_MAX_PER_WINDOW;
const RATE_LIMIT_MAX = RATE_LIMIT_RAW
  ? (() => {
      const n = Number(RATE_LIMIT_RAW);
      if (!Number.isFinite(n)) {
        logger.fatal(
          { value: RATE_LIMIT_RAW },
          "RATE_LIMIT_MAX_PER_WINDOW must be a finite number",
        );
        process.exit(1);
      }
      if (n < 1 || !Number.isInteger(n)) {
        logger.fatal({ value: n }, "RATE_LIMIT_MAX_PER_WINDOW must be a positive integer");
        process.exit(1);
      }
      return n;
    })()
  : 200;

const RATE_LIMIT_WINDOW_RAW = process.env.RATE_LIMIT_WINDOW_MS;
const RATE_LIMIT_WINDOW_MS = RATE_LIMIT_WINDOW_RAW
  ? (() => {
      const n = Number(RATE_LIMIT_WINDOW_RAW);
      if (!Number.isFinite(n)) {
        logger.fatal(
          { value: RATE_LIMIT_WINDOW_RAW },
          "RATE_LIMIT_WINDOW_MS must be a finite number",
        );
        process.exit(1);
      }
      if (n < 1 || !Number.isInteger(n)) {
        logger.fatal(
          { value: n },
          "RATE_LIMIT_WINDOW_MS must be a positive integer (milliseconds)",
        );
        process.exit(1);
      }
      return n;
    })()
  : 60_000;

// Required checks on startup
if (!VERIFY_TOKEN) {
  logger.fatal("VERIFY_TOKEN environment variable is not set.");
  process.exit(1);
}
if (!PAGE_ACCESS_TOKEN) {
  logger.fatal("PAGE_ACCESS_TOKEN environment variable is not set.");
  process.exit(1);
}
if (!APP_SECRET) {
  logger.fatal("APP_SECRET environment variable is not set.");
  process.exit(1);
}

// Configure the messenger module
configure(PAGE_ACCESS_TOKEN, GRAPH_API_VERSION, {
  maxPerWindow: RATE_LIMIT_MAX,
  windowMs: RATE_LIMIT_WINDOW_MS,
});

// ---------------------------------------------------------------------------
// Raw-body middleware (needed for Hmac verification)
// ---------------------------------------------------------------------------
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }),
);

// ---------------------------------------------------------------------------
// In-flight tracking for graceful shutdown
// ---------------------------------------------------------------------------
/** @type {Set<Promise<unknown>>} */
const inFlight = new Set();

/**
 * Wrap a promise so the process waits for it during shutdown.
 * @param {Promise<unknown>} promise
 * @returns {Promise<unknown>}
 */
function track(promise) {
  inFlight.add(promise);
  promise.then(
    () => inFlight.delete(promise),
    () => inFlight.delete(promise),
  );
  return promise;
}

// Expose for tests
function getInFlightCount() {
  return inFlight.size;
}

// ---------------------------------------------------------------------------
// Webhook verification (Facebook handshake)
// ---------------------------------------------------------------------------
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    logger.info("Webhook verified successfully.");
    return res.status(200).send(challenge);
  }

  logger.warn("Webhook verification failed – mismatched token or missing mode.");
  return res.sendStatus(403);
});

// ---------------------------------------------------------------------------
// Incoming messages (including group messages)
// ---------------------------------------------------------------------------
app.post("/webhook", (req, res) => {
  const body = req.body;
  const rawBody = req.rawBody;
  const signature = req.get("X-Hub-Signature-256");

  // 1. Verify payload signature
  if (!verifySignature(rawBody, signature, APP_SECRET)) {
    logger.warn("Ignoring request – invalid HMAC signature");
    return res.sendStatus(403);
  }

  // Validate webhook payload structure
  const validationError = validateWebhookPayload(body);
  if (validationError) {
    logger.warn({ validationError }, "Malformed webhook payload");
    return res.sendStatus(200); // still return 200 so Facebook doesn't retry
  }

  // Fire-and-forget but track in-flight so shutdown drains it.
  track(processMessages(body)).catch((err) =>
    logger.error({ err }, "Unhandled error in processMessages"),
  );

  // Facebook expects a 200 OK quickly – send it immediately.
  res.sendStatus(200);
});

// ---------------------------------------------------------------------------
// Health-check endpoint
// ---------------------------------------------------------------------------
app.get("/", (_req, res) => {
  const status = getStatus();
  res.json({
    ok: true,
    message: "god is loving and kind – bot is running",
    uptimeMs: status.uptimeMs,
    stats: status.stats,
  });
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
let server;
let started = false;

/**
 * Start the HTTP server. Called automatically by `node src/index.js` but
 * can also be called manually by tests after setting up the environment.
 */
function start() {
  if (started) return;
  started = true;

  server = app.listen(PORT, () => {
    logger.info({ port: PORT }, "Messenger bot listening");
  });

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

/**
 * Close the HTTP server and drain in-flight work without calling process.exit().
 * Useful for tests; also used internally by shutdown().
 * @returns {Promise<void>}
 */
function stop() {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }

    server.close(() => {
      logger.info("HTTP server closed");
      if (inFlight.size > 0) {
        logger.info({ count: inFlight.size }, "Waiting for in-flight processing to complete");
      }
      Promise.allSettled(Array.from(inFlight)).then(() => {
        logger.info("All in-flight work complete");
        resolve();
      });
    });
  });
}

async function shutdown(signal) {
  logger.info({ signal, inFlight: inFlight.size }, "Shutting down gracefully");

  // Force exit after 10s if connections don't drain
  const forceExitTimer = setTimeout(() => {
    logger.error({ remaining: inFlight.size }, "Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  await stop();
  process.exit(0);
}

// Only auto-start when this file is the main entry point (not when required as a module)
if (require.main === module) {
  start();
}

module.exports = { app, getInFlightCount, start, stop, shutdown };
