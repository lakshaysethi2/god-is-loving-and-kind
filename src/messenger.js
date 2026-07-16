const axios = require("axios");
const { RateLimiter } = require("./ratelimit");
const { DedupCache } = require("./dedup");
const logger = require("./logger");
const { recordSent, recordSuccess, recordFailure, recordRateLimited } = require("./status");

// ---------------------------------------------------------------------------
// Module-level state — configured once at startup via configure()
// ---------------------------------------------------------------------------
let pageAccessToken = "";
let graphApiVersion = "v21.0";

/** @type {RateLimiter} */
let rateLimiter = new RateLimiter();

/** @type {DedupCache} */
let dedupCache = new DedupCache();

/**
 * Configure the messenger module.
 *
 * @param {string}  token                - Facebook Page Access Token.
 * @param {string}  [version]            - Graph API version (default "v21.0").
 * @param {object}  [rateLimitOptions]   - Override rate-limiter defaults.
 * @param {number}  [rateLimitOptions.maxPerWindow=200]
 * @param {number}  [rateLimitOptions.windowMs=60000]
 * @param {object}  [dedupOptions]       - Override dedup cache defaults.
 * @param {number}  [dedupOptions.ttlMs=60000]
 * @param {number}  [dedupOptions.maxSize=10000]
 */
function configure(token, version, rateLimitOptions, dedupOptions) {
  pageAccessToken = token;
  if (version) graphApiVersion = version;

  if (rateLimitOptions) {
    rateLimiter.dispose();
    rateLimiter = new RateLimiter(rateLimitOptions);
  }

  if (dedupOptions) {
    dedupCache.dispose();
    dedupCache = new DedupCache(dedupOptions);
  }
}

// Exposed so tests can inspect the instance
function getRateLimiter() {
  return rateLimiter;
}

function getDedupCache() {
  return dedupCache;
}

/**
 * Extract a unique event identifier from a Messenger event, if one exists.
 * Returns `null` if no reliable ID is available.
 *
 * @param {object} event
 * @returns {string|null}
 */
function getEventId(event) {
  if (event.message?.mid) return `mid:${event.message.mid}`;
  if (event.postback?.mid) return `mid:${event.postback.mid}`;
  // Fallback: if there's no MID we can't deduplicate — process anyway
  return null;
}

/**
 * Process incoming message entries and reply to each.
 *
 * @param {object} body - The parsed Facebook webhook payload.
 * @returns {Promise<Array<{status: string, recipientId?: string, error?: string}>>}
 */
async function processMessages(body) {
  const results = [];

  if (!body || typeof body !== "object") return results;

  for (const entry of body.entry || []) {
    if (!entry.messaging || !Array.isArray(entry.messaging)) continue;

    for (const event of entry.messaging) {
      // Skip echo events — these are messages *sent by* our page, not from
      // users. Without this check the bot would reply to itself in a loop.
      if (event.message?.is_echo) continue;

      // Deduplicate: skip events we've already processed
      const eventId = getEventId(event);
      if (eventId && dedupCache.isDuplicate(eventId)) {
        logger.debug({ eventId }, "Skipping duplicate event");
        continue;
      }

      // Respond to EVERY incoming message type:
      //   - text messages
      //   - images, stickers, GIFs, files, audio, video
      //   - location shares
      //   - any other attachment
      // This covers both 1:1 conversations AND group threads.
      if (event.message || event.postback) {
        const senderId = event.sender?.id;
        if (!senderId) continue;

        // Rate-limit check: don't hammer Facebook's API
        if (!rateLimiter.tryConsume(senderId)) {
          recordRateLimited();
          logger.warn(
            {
              recipientId: senderId,
              count: rateLimiter.getCount(senderId),
              max: rateLimiter.maxPerWindow,
            },
            "Rate-limited: skipping reply",
          );
          continue;
        }

        recordSent();
        results.push({
          status: "pending",
          recipientId: senderId,
        });
      }
    }
  }

  // Send all messages concurrently and collect results.
  // Each recipient gets a typing indicator first, then the reply.
  // If the indicator fails, the reply is still attempted.
  const sentResults = await Promise.allSettled(
    results.map((r) =>
      (async () => {
        await sendTypingIndicator(r.recipientId);
        try {
          await sendMessage(r.recipientId, "god is loving and kind");
          recordSuccess();
          return { status: "fulfilled", recipientId: r.recipientId };
        } catch (err) {
          const detail = err.response?.data?.error?.message || err.message || String(err);
          recordFailure();
          logger.error(
            {
              recipientId: r.recipientId,
              statusCode: err.response?.status,
              apiErrorCode: err.response?.data?.error?.code,
            },
            "Failed to send message",
          );
          return {
            status: "rejected",
            recipientId: r.recipientId,
            error: detail,
          };
        }
      })(),
    ),
  );

  // Every individual promise catches errors, so .value is always present
  return sentResults.map((r) => r.value);
}

/**
 * Validate the structure of an incoming Facebook webhook payload.
 * Logs a warning if the payload has an unexpected structure.
 *
 * @param {unknown} body - The parsed incoming body.
 * @returns {string|null} An error message string if invalid, or null if valid.
 */
function validateWebhookPayload(body) {
  if (!body || typeof body !== "object") {
    return "body is missing or not an object";
  }

  if (body.object !== "page") {
    return `unexpected body.object: "${body.object}" (expected "page")`;
  }

  if (!Array.isArray(body.entry)) {
    return "body.entry is missing or not an array";
  }

  for (let i = 0; i < body.entry.length; i++) {
    const entry = body.entry[i];

    if (!entry || typeof entry !== "object") {
      return `body.entry[${i}] is not an object`;
    }

    // messaging is optional — if present it must be an array
    if ("messaging" in entry && !Array.isArray(entry.messaging)) {
      return `body.entry[${i}].messaging is not an array`;
    }

    if (Array.isArray(entry.messaging)) {
      for (let j = 0; j < entry.messaging.length; j++) {
        const event = entry.messaging[j];
        if (!event || typeof event !== "object") {
          return `body.entry[${i}].messaging[${j}] is not an object`;
        }

        // sender is optional in some event types, but if present must be an object
        if ("sender" in event && (!event.sender || typeof event.sender !== "object")) {
          return `body.entry[${i}].messaging[${j}].sender is not an object`;
        }
      }
    }
  }

  return null; // valid
}

/**
 * Send a "typing on" indicator so the user sees the bot is responding.
 * Errors are logged but not propagated — a failed indicator shouldn't
 * block the actual reply.
 *
 * @param {string} recipientId - The PSID of the recipient.
 */
async function sendTypingIndicator(recipientId) {
  try {
    await axios.post(
      `https://graph.facebook.com/${graphApiVersion}/me/messages`,
      {
        recipient: { id: recipientId },
        sender_action: "typing_on",
      },
      {
        params: { access_token: pageAccessToken },
      },
    );
  } catch (err) {
    logger.warn(
      { recipientId, statusCode: err.response?.status },
      "Failed to send typing indicator",
    );
  }
}

/**
 * Send a text message via Facebook Graph API.
 *
 * @param {string} recipientId - The PSID of the recipient.
 * @param {string} text        - The message text.
 * @returns {Promise<object>} The Axios response data.
 */
async function sendMessage(recipientId, text) {
  const response = await axios.post(
    `https://graph.facebook.com/${graphApiVersion}/me/messages`,
    {
      recipient: { id: recipientId },
      message: { text },
    },
    {
      params: { access_token: pageAccessToken },
    },
  );

  return response.data;
}

module.exports = {
  configure,
  getDedupCache,
  getEventId,
  getRateLimiter,
  processMessages,
  sendMessage,
  sendTypingIndicator,
  validateWebhookPayload,
};
