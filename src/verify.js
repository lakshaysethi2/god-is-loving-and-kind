const crypto = require("crypto");

/**
 * Verifies a Facebook webhook HMAC-SHA256 signature.
 *
 * @param {string} rawBody     - The raw request body as a UTF-8 string.
 * @param {string|null|undefined} signatureHeader - The value of the
 *        X-Hub-Signature-256 header (e.g. "sha256=abc123...").
 * @param {string} appSecret   - The Facebook App Secret.
 * @returns {boolean} `true` when the signature is valid, `false` otherwise.
 */
function verifySignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !rawBody || !appSecret) {
    return false;
  }

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  // Facebook sends "sha256=<hex>" – parse the hex part
  const prefix = "sha256=";
  if (typeof signatureHeader !== "string" || !signatureHeader.startsWith(prefix)) {
    return false;
  }
  const provided = signatureHeader.slice(prefix.length);

  // Buffer lengths must match for timingSafeEqual
  if (expected.length !== provided.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

module.exports = { verifySignature };
