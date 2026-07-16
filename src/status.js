/**
 * Simple in-process application status tracker.
 *
 * Records start time, message counts, and error counts so the healthcheck
 * endpoint can serve meaningful telemetry.
 */

const startTime = Date.now();

/** @type {{ total: number, succeeded: number, failed: number, rateLimited: number }} */
const stats = {
  total: 0,
  succeeded: 0,
  failed: 0,
  rateLimited: 0,
};

function recordSent() {
  stats.total++;
}

function recordSuccess() {
  stats.succeeded++;
}

function recordFailure() {
  stats.failed++;
}

function recordRateLimited() {
  stats.rateLimited++;
}

/**
 * Get a snapshot of current status.
 *
 * @returns {{ uptimeMs: number, stats: typeof stats }}
 */
function getStatus() {
  return {
    uptimeMs: Date.now() - startTime,
    stats: { ...stats },
  };
}

module.exports = { recordSent, recordSuccess, recordFailure, recordRateLimited, getStatus };
