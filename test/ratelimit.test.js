const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");

const { RateLimiter } = require("../src/ratelimit");

describe("RateLimiter", () => {
  let limiter;

  after(() => {
    if (limiter) limiter.dispose();
  });

  it("allows the first message through", () => {
    limiter = new RateLimiter({ maxPerWindow: 3, windowMs: 60000 });
    assert.strictEqual(limiter.tryConsume("user1"), true);
  });

  it("allows messages up to maxPerWindow", () => {
    limiter = new RateLimiter({ maxPerWindow: 3, windowMs: 60000 });

    assert.strictEqual(limiter.tryConsume("user2"), true);
    assert.strictEqual(limiter.tryConsume("user2"), true);
    assert.strictEqual(limiter.tryConsume("user2"), true);
    // Fourth should be blocked
    assert.strictEqual(limiter.tryConsume("user2"), false);
  });

  it("treats different recipients independently", () => {
    limiter = new RateLimiter({ maxPerWindow: 1, windowMs: 60000 });

    assert.strictEqual(limiter.tryConsume("alice"), true);
    assert.strictEqual(limiter.tryConsume("alice"), false); // blocked

    // Bob has his own counter
    assert.strictEqual(limiter.tryConsume("bob"), true);
    assert.strictEqual(limiter.tryConsume("bob"), false); // blocked
  });

  it("resets the count after the window expires", async () => {
    // Use a very short window
    limiter = new RateLimiter({ maxPerWindow: 1, windowMs: 50 });

    assert.strictEqual(limiter.tryConsume("user3"), true);
    assert.strictEqual(limiter.tryConsume("user3"), false); // blocked

    // Wait for the window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.strictEqual(limiter.tryConsume("user3"), true); // allowed again
  });

  it("reports correct count via getCount", () => {
    limiter = new RateLimiter({ maxPerWindow: 5, windowMs: 60000 });

    assert.strictEqual(limiter.getCount("user4"), 0);
    limiter.tryConsume("user4");
    assert.strictEqual(limiter.getCount("user4"), 1);
    limiter.tryConsume("user4");
    assert.strictEqual(limiter.getCount("user4"), 2);
  });

  it("returns 0 for unknown recipients via getCount", () => {
    limiter = new RateLimiter({ maxPerWindow: 5, windowMs: 60000 });
    assert.strictEqual(limiter.getCount("nonexistent"), 0);
  });

  it("correctly prunes old entries after window expires", async () => {
    limiter = new RateLimiter({ maxPerWindow: 2, windowMs: 30 });

    limiter.tryConsume("prune_me");
    limiter.tryConsume("prune_me");
    assert.strictEqual(limiter.getCount("prune_me"), 2);

    // Wait for window expiry
    await new Promise((resolve) => setTimeout(resolve, 40));

    // Old entries should be pruned on next access
    assert.strictEqual(limiter.getCount("prune_me"), 0);
    // Should be allowed again
    assert.strictEqual(limiter.tryConsume("prune_me"), true);
    assert.strictEqual(limiter.getCount("prune_me"), 1);
  });

  it("cleans up stale recipients via _cleanup", () => {
    const shortMs = 20;
    limiter = new RateLimiter({ maxPerWindow: 2, windowMs: shortMs, cleanupIntervalMs: 10000 });

    limiter.tryConsume("stale_user");
    assert.strictEqual(limiter.windows.has("stale_user"), true);

    // Manually advance time: set the timestamp to be old
    const timestamps = limiter.windows.get("stale_user");
    timestamps[0] = Date.now() - shortMs - 1;

    limiter._cleanup();

    // Should now be removed
    assert.strictEqual(limiter.windows.has("stale_user"), false);
  });

  it("dispose stops the cleanup timer", () => {
    limiter = new RateLimiter({ maxPerWindow: 5, windowMs: 60000 });
    limiter.dispose();
    // After dispose, calling _cleanup shouldn't throw
    limiter._cleanup();
    // No assertions needed — dispose shouldn't break the object
  });
});
