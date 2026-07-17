const { describe, it } = require("node:test");
const assert = require("node:assert");

const { verifySignature } = require("../src/verify");

// A known secret and payload for deterministic HMAC-SHA256 testing
const SECRET = "my_app_secret_123";
const RAW_BODY = '{"object":"page","entry":[]}';

// Pre-computed: crypto.createHmac("sha256", SECRET).update(RAW_BODY).digest("hex")
// We compute it at test-time to stay verifiable.
const { createHmac } = require("node:crypto");
const VALID_HEX = createHmac("sha256", SECRET).update(RAW_BODY, "utf8").digest("hex");
const VALID_SIGNATURE = `sha256=${VALID_HEX}`;

describe("verifySignature", () => {
  it("returns true for a valid signature", () => {
    assert.strictEqual(verifySignature(RAW_BODY, VALID_SIGNATURE, SECRET), true);
  });

  it("returns false when signature header is missing", () => {
    assert.strictEqual(verifySignature(RAW_BODY, null, SECRET), false);
    assert.strictEqual(verifySignature(RAW_BODY, undefined, SECRET), false);
    assert.strictEqual(verifySignature(RAW_BODY, "", SECRET), false);
  });

  it("returns false when rawBody is missing", () => {
    assert.strictEqual(verifySignature(null, VALID_SIGNATURE, SECRET), false);
    assert.strictEqual(verifySignature(undefined, VALID_SIGNATURE, SECRET), false);
    assert.strictEqual(verifySignature("", VALID_SIGNATURE, SECRET), false);
  });

  it("returns false when appSecret is missing", () => {
    assert.strictEqual(verifySignature(RAW_BODY, VALID_SIGNATURE, null), false);
    assert.strictEqual(verifySignature(RAW_BODY, VALID_SIGNATURE, undefined), false);
    assert.strictEqual(verifySignature(RAW_BODY, VALID_SIGNATURE, ""), false);
  });

  it("returns false for an invalid signature", () => {
    const badSig = `sha256=${"a".repeat(64)}`;
    assert.strictEqual(verifySignature(RAW_BODY, badSig, SECRET), false);
  });

  it("returns false when signature header has wrong format", () => {
    // Missing "sha256=" prefix
    const wrongFormat = VALID_HEX;
    assert.strictEqual(verifySignature(RAW_BODY, wrongFormat, SECRET), false);
  });

  it("returns false when signature header has wrong prefix", () => {
    const wrongPrefix = `md5=${VALID_HEX}`;
    assert.strictEqual(verifySignature(RAW_BODY, wrongPrefix, SECRET), false);
  });

  it("returns false when signature hex has wrong length", () => {
    // Too short
    assert.strictEqual(verifySignature(RAW_BODY, "sha256=abc123", SECRET), false);
    // Too long
    assert.strictEqual(verifySignature(RAW_BODY, `sha256=${"a".repeat(128)}`, SECRET), false);
  });

  it("returns false when signatureHeader is not a string", () => {
    assert.strictEqual(verifySignature(RAW_BODY, 12345, SECRET), false);
    assert.strictEqual(verifySignature(RAW_BODY, ["sha256=abc"], SECRET), false);
    assert.strictEqual(verifySignature(RAW_BODY, {}, SECRET), false);
  });

  it("uses a different secret produces a different result", () => {
    const wrongSecret = "different_secret";
    assert.strictEqual(verifySignature(RAW_BODY, VALID_SIGNATURE, wrongSecret), false);
  });

  it("different body produces a different result", () => {
    const otherBody = '{"object":"page","entry":[{"id":"123"}]}';
    assert.strictEqual(verifySignature(otherBody, VALID_SIGNATURE, SECRET), false);
  });
});
