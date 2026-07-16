const express = require("express");

const { verifySignature } = require("./verify");
const { configure, processMessages } = require("./messenger");

const app = express();

// ---------------------------------------------------------------------------
// Configuration from environment variables
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const APP_SECRET = process.env.APP_SECRET;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v21.0";

// Required checks on startup
if (!VERIFY_TOKEN) {
  console.error("FATAL: VERIFY_TOKEN environment variable is not set.");
  process.exit(1);
}
if (!PAGE_ACCESS_TOKEN) {
  console.error("FATAL: PAGE_ACCESS_TOKEN environment variable is not set.");
  process.exit(1);
}
if (!APP_SECRET) {
  console.error("FATAL: APP_SECRET environment variable is not set.");
  process.exit(1);
}

// Configure the messenger module
configure(PAGE_ACCESS_TOKEN, GRAPH_API_VERSION);

// ---------------------------------------------------------------------------
// Raw-body middleware (needed for Hmac verification)
// ---------------------------------------------------------------------------
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

// ---------------------------------------------------------------------------
// Webhook verification (Facebook handshake)
// ---------------------------------------------------------------------------
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully.");
    return res.status(200).send(challenge);
  }

  console.warn("Webhook verification failed – mismatched token or missing mode.");
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
    console.warn("Ignoring request – invalid HMAC signature");
    return res.sendStatus(403);
  }

  // Facebook may send a hub.challenge in POST too during some flows – ignore.
  if (body.object !== "page") {
    return res.sendStatus(404);
  }

  // Fire-and-forget message processing so the HTTP handler returns promptly.
  processMessages(body).catch((err) =>
    console.error("Unhandled error in processMessages:", err)
  );

  // Facebook expects a 200 OK quickly – send it immediately.
  res.sendStatus(200);
});

// ---------------------------------------------------------------------------
// Health-check endpoint
// ---------------------------------------------------------------------------
app.get("/", (_req, res) => {
  res.send("god is loving and kind – bot is running");
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
const server = app.listen(PORT, () => {
  console.log(`Messenger bot listening on port ${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully`);
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
  // Force exit after 10s if connections don't drain
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
