const { describe, it, after } = require("node:test");
const assert = require("node:assert");

// Reload the module fresh so we start with clean stats
delete require.cache[require.resolve("../src/status")];
const {
  recordSent,
  recordSuccess,
  recordFailure,
  recordRateLimited,
  getStatus,
} = require("../src/status");

describe("status module", () => {
  after(() => {
    delete require.cache[require.resolve("../src/status")];
  });

  it("starts with zero counts", () => {
    const status = getStatus();
    assert.strictEqual(status.stats.total, 0);
    assert.strictEqual(status.stats.succeeded, 0);
    assert.strictEqual(status.stats.failed, 0);
    assert.strictEqual(status.stats.rateLimited, 0);
    assert.ok(status.uptimeMs > 0);
  });

  it("increments counts correctly", () => {
    recordSent();
    recordSent();
    recordSuccess();
    recordFailure();
    recordRateLimited();
    recordRateLimited();
    recordRateLimited();

    const status = getStatus();
    assert.strictEqual(status.stats.total, 2);
    assert.strictEqual(status.stats.succeeded, 1);
    assert.strictEqual(status.stats.failed, 1);
    assert.strictEqual(status.stats.rateLimited, 3);
  });

  it("getStatus returns a snapshot (not a live reference)", () => {
    const s1 = getStatus();
    recordSent();
    const s2 = getStatus();
    // s1 should not have been mutated
    assert.strictEqual(s1.stats.total, 2);
    assert.strictEqual(s2.stats.total, 3);
  });
});
