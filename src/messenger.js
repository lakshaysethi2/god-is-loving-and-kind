const axios = require("axios");

// ---------------------------------------------------------------------------
// These are dependencies that must be set before calling processMessages() or
// sendMessage(). They mirror the env-var pattern in index.js.
// ---------------------------------------------------------------------------
let pageAccessToken = "";
let graphApiVersion = "v21.0";

function configure(token, version) {
  pageAccessToken = token;
  if (version) graphApiVersion = version;
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

      // Respond to EVERY incoming message type:
      //   - text messages
      //   - images, stickers, GIFs, files, audio, video
      //   - location shares
      //   - any other attachment
      // This covers both 1:1 conversations AND group threads.
      if (event.message || event.postback) {
        const senderId = event.sender?.id;
        if (!senderId) continue;

        results.push({
          status: "pending",
          recipientId: senderId,
        });
      }
    }
  }

  // Send all messages concurrently and collect results
  const sentResults = await Promise.allSettled(
    results.map((r) =>
      sendMessage(r.recipientId, "god is loving and kind")
        .then(() => ({ status: "fulfilled", recipientId: r.recipientId }))
        .catch((err) => {
          const detail =
            err.response?.data?.error?.message ||
            err.message ||
            String(err);
          console.error(
            `Failed to send message to ${r.recipientId}: ${detail}`
          );
          return {
            status: "rejected",
            recipientId: r.recipientId,
            error: detail,
          };
        })
    )
  );

  // Every individual promise catches errors, so .value is always present
  return sentResults.map((r) => r.value);
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
    }
  );

  return response.data;
}

module.exports = { configure, processMessages, sendMessage };
