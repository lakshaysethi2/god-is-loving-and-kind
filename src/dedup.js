/**
 * Bounded, TTL-based store for deduplicating processed event/message IDs.
 *
 * Webhook providers can redeliver the same event. Without idempotency, the
 * bot could reply multiple times to a single message. This cache tracks
 * recently-seen event identifiers so duplicates are silently skipped.
 *
 * The store has a maximum size to bound memory usage. Oldest entries are
 * evicted when the capacity is exceeded, regardless of TTL.
 */
class DedupCache {
  /**
   * @param {object} [options]
   * @param {number} [options.ttlMs=60000]      - How long an ID is remembered (ms).
   * @param {number} [options.maxSize=10000]     - Max entries before LRU-style eviction.
   * @param {number} [options.cleanupIntervalMs=60000] - Periodic stale-cleanup interval (ms).
   */
  constructor({ ttlMs = 60000, maxSize = 10000, cleanupIntervalMs = 60000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;

    /** @type {Map<string, number>} id → timestamp */
    this._store = new Map();

    this._cleanupTimer = setInterval(() => this._cleanup(), cleanupIntervalMs);
    this._cleanupTimer.unref();
  }

  /**
   * Check if an ID has been seen already. If not, record it and return false.
   *
   * @param {string} id - The event identifier (e.g. `event.message.mid`).
   * @returns {boolean} `true` if this ID was already seen (duplicate).
   */
  isDuplicate(id) {
    if (this._store.has(id)) {
      return true;
    }

    // Evict oldest if at capacity (LRU-style: delete the first-inserted entry)
    if (this._store.size >= this.maxSize) {
      const oldestKey = this._store.keys().next().value;
      this._store.delete(oldestKey);
    }

    this._store.set(id, Date.now());
    return false;
  }

  /**
   * Check if an ID is in the cache without recording it.
   * This is useful for tests and diagnostics.
   *
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    const ts = this._store.get(id);
    if (ts === undefined) return false;
    // If expired, clean it up and report as missing
    if (Date.now() - ts > this.ttlMs) {
      this._store.delete(id);
      return false;
    }
    return true;
  }

  /**
   * Remove expired entries.
   */
  _cleanup() {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, ts] of this._store) {
      if (ts < cutoff) {
        this._store.delete(id);
      }
    }
  }

  /**
   * Current number of stored entries.
   */
  get size() {
    return this._store.size;
  }

  /**
   * Stop the cleanup timer.
   */
  dispose() {
    clearInterval(this._cleanupTimer);
  }

  /**
   * Clear all entries (useful in tests).
   */
  clear() {
    this._store.clear();
  }
}

module.exports = { DedupCache };
