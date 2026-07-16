const { describe, it } = require("node:test");
const assert = require("node:assert");

const { DedupCache } = require("../src/dedup");

describe("DedupCache", () => {
  it("returns false for a new ID (not a duplicate)", () => {
    const cache = new DedupCache({ ttlMs: 60000, maxSize: 100 });
    assert.strictEqual(cache.isDuplicate("mid:abc123"), false);
    cache.dispose();
  });

  it("returns true for a duplicate ID", () => {
    const cache = new DedupCache({ ttlMs: 60000, maxSize: 100 });
    cache.isDuplicate("mid:abc123");
    assert.strictEqual(cache.isDuplicate("mid:abc123"), true);
    cache.dispose();
  });

  it("treats different IDs independently", () => {
    const cache = new DedupCache({ ttlMs: 60000, maxSize: 100 });
    cache.isDuplicate("mid:first");
    assert.strictEqual(cache.isDuplicate("mid:second"), false);
    assert.strictEqual(cache.isDuplicate("mid:first"), true);
    cache.dispose();
  });

  it("evicts oldest entries when maxSize is exceeded", () => {
    const cache = new DedupCache({ ttlMs: 60000, maxSize: 100 });

    for (let i = 0; i < 100; i++) {
      cache.isDuplicate(`mid:${i}`);
    }
    assert.strictEqual(cache.size, 100);

    // This insert should evict the oldest ("mid:0")
    cache.isDuplicate("mid:new");
    assert.strictEqual(cache.size, 100);

    // "mid:0" should have been evicted (check without recording)
    assert.strictEqual(cache.has("mid:0"), false);
    // But "mid:1" is still in the cache
    assert.strictEqual(cache.has("mid:1"), true);

    cache.dispose();
  });

  it("expires entries after ttlMs", async () => {
    const shortCache = new DedupCache({ ttlMs: 30, maxSize: 100 });

    shortCache.isDuplicate("mid:expire_me");

    await new Promise((r) => setTimeout(r, 50));

    // Trigger cleanup manually since the periodic timer may not have fired
    shortCache._cleanup();

    // Should have been removed by _cleanup
    assert.strictEqual(shortCache.has("mid:expire_me"), false);
    shortCache.dispose();
  });

  it("clear removes all entries", () => {
    const cache = new DedupCache({ ttlMs: 60000, maxSize: 100 });
    cache.isDuplicate("mid:a");
    cache.isDuplicate("mid:b");
    assert.strictEqual(cache.size, 2);

    cache.clear();
    assert.strictEqual(cache.size, 0);
    assert.strictEqual(cache.isDuplicate("mid:a"), false);
    cache.dispose();
  });

  it("dispose stops the cleanup timer", () => {
    const cache = new DedupCache({ ttlMs: 60000, maxSize: 100 });
    cache.dispose();
    // Should not throw
    cache._cleanup();
  });
});
