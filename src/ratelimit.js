/**
 * Per-recipient sliding-window rate limiter for Facebook Messenger sends.
 *
 * Facebook's API rate limit is typically 200 messages per user per 60-second
 * window (standard tier). This limiter prevents bursts from exceeding that.
 *
 * Usage:
 *   const limiter = new RateLimiter({ maxPerWindow: 200, windowMs: 60000 });
 *   if (limiter.tryConsume("psid_12345")) {
 *     await sendMessage(...);
 *   } else {
 *     // skip — rate limited
 *   }
 */
class RateLimiter {
  /**
   * @param {object} options
   * @param {number} [options.maxPerWindow=200]  - Max messages per recipient per window.
   * @param {number} [options.windowMs=60000]    - Window duration in milliseconds.
   * @param {number} [options.cleanupIntervalMs=300000] - How often to prune stale entries (default 5 min).
   */
  constructor({ maxPerWindow = 200, windowMs = 60000, cleanupIntervalMs = 300000 } = {}) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;

    /** @type {Map<string, number[]>} recipientId → sorted timestamps */
    this.windows = new Map();

    this._cleanupTimer = setInterval(() => this._cleanup(), cleanupIntervalMs);
    // Allow the timer to keep the process alive only if other work is happening
    this._cleanupTimer.unref();
  }

  /**
   * Try to consume one send "slot" for a recipient.
   *
   * @param {string} recipientId - The PSID of the recipient.
   * @returns {boolean} `true` if under the limit (proceed), `false` if rate-limited.
   */
  tryConsume(recipientId) {
    this._pruneRecipient(recipientId);

    let timestamps = this.windows.get(recipientId);
    if (!timestamps) {
      timestamps = [];
      this.windows.set(recipientId, timestamps);
    }

    if (timestamps.length >= this.maxPerWindow) {
      return false; // rate limited
    }

    timestamps.push(Date.now());
    return true;
  }

  /**
   * Get the number of sends consumed in the current window for a recipient.
   * Useful for diagnostics / healthcheck.
   */
  getCount(recipientId) {
    this._pruneRecipient(recipientId);
    return this.windows.get(recipientId)?.length ?? 0;
  }

  /**
   * Remove expired timestamps for a single recipient.
   */
  _pruneRecipient(recipientId) {
    const timestamps = this.windows.get(recipientId);
    if (!timestamps) return;

    const cutoff = Date.now() - this.windowMs;
    // Since timestamps are inserted in order via push, find the first valid
    // index and slice. (Binary search would be overkill for the expected size.)
    let firstValid = 0;
    while (firstValid < timestamps.length && timestamps[firstValid] < cutoff) {
      firstValid++;
    }

    if (firstValid > 0) {
      this.windows.set(recipientId, timestamps.slice(firstValid));
    }
  }

  /**
   * Prune ALL recipients that have no recent activity.
   * Called periodically by _cleanupTimer.
   */
  _cleanup() {
    const cutoff = Date.now() - this.windowMs;
    for (const [recipientId, timestamps] of this.windows) {
      // If the most recent timestamp is older than the window, the whole
      // entry is stale.
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] < cutoff) {
        this.windows.delete(recipientId);
      }
    }
  }

  /**
   * Stop the cleanup timer. Useful in tests.
   */
  dispose() {
    clearInterval(this._cleanupTimer);
  }
}

module.exports = { RateLimiter };
