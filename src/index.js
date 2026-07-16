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
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX_PER_WINDOW) || 200;
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;

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

  // Fire-and-forget message processing so the HTTP handler returns promptly.
  processMessages(body).catch((err) => logger.error({ err }, "Unhandled error in processMessages"));

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
const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, "Messenger bot listening");
});

function shutdown(signal) {
  logger.info({ signal }, "Shutting down gracefully");
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
  // Force exit after 10s if connections don't drain
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
