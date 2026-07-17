const { describe, it, before, after, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const crypto = require("node:crypto");
const net = require("node:net");
const axios = require("axios");

/**
 * Find a free port by binding to port 0 and reading the assigned port.
 */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function makeEnv(port) {
  return {
    ...process.env,
    PORT: String(port),
    VERIFY_TOKEN: "test_verify_token",
    PAGE_ACCESS_TOKEN: "test_page_token",
    APP_SECRET: "test_app_secret",
    LOG_LEVEL: "fatal",
    NODE_ENV: "development",
  };
}

describe("webhook HTTP endpoint", () => {
  let PORT;
  let mod;

  before(async () => {
    PORT = await getFreePort();

    // Set env vars before importing the module
    Object.assign(process.env, makeEnv(PORT));
    delete require.cache[require.resolve("../src/index")];
    mod = require("../src/index");
    mod.start();
  });

  after(async () => {
    // Close the server so the test process can exit cleanly
    if (mod?.stop) await mod.stop();
  });

  beforeEach(() => {
    mock.method(axios, "post", mock.fn());
    axios.post.mock.mockImplementation(() => Promise.resolve({ data: {} }));
  });

  afterEach(() => {
    mock.reset();
  });

  function get(path) {
    return new Promise((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${PORT}${path}`, (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => resolve({ statusCode: res.statusCode, body }));
        })
        .on("error", reject);
    });
  }

  function signedPost(body) {
    return new Promise((resolve, reject) => {
      const rawBody = JSON.stringify(body);
      const hmac = crypto
        .createHmac("sha256", "test_app_secret")
        .update(rawBody, "utf8")
        .digest("hex");
      const signature = `sha256=${hmac}`;

      const options = {
        hostname: "127.0.0.1",
        port: PORT,
        path: "/webhook",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(rawBody),
          "X-Hub-Signature-256": signature,
        },
      };

      const req = http.request(options, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ statusCode: res.statusCode, body }));
      });
      req.on("error", reject);
      req.write(rawBody);
      req.end();
    });
  }

  function unsigedPost(body, signature) {
    return new Promise((resolve, reject) => {
      const rawBody = JSON.stringify(body);

      const options = {
        hostname: "127.0.0.1",
        port: PORT,
        path: "/webhook",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(rawBody),
          "X-Hub-Signature-256": signature || "sha256=invalid",
        },
      };

      const req = http.request(options, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ statusCode: res.statusCode }));
      });
      req.on("error", reject);
      req.write(rawBody);
      req.end();
    });
  }

  describe("GET /webhook (verification)", () => {
    it("responds 200 with challenge when verify token matches", async () => {
      const res = await get(
        "/webhook?hub.mode=subscribe&hub.verify_token=test_verify_token&hub.challenge=challenge_123",
      );
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body, "challenge_123");
    });

    it("responds 403 when verify token is wrong", async () => {
      const res = await get(
        "/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge_123",
      );
      assert.strictEqual(res.statusCode, 403);
    });

    it("responds 403 when mode is missing", async () => {
      const res = await get(
        "/webhook?hub.verify_token=test_verify_token&hub.challenge=challenge_123",
      );
      assert.strictEqual(res.statusCode, 403);
    });
  });

  describe("POST /webhook", () => {
    it("responds 403 when HMAC signature is invalid", async () => {
      const res = await unsigedPost({ object: "page", entry: [] }, "sha256=invalid");
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(axios.post.mock.calls.length, 0);
    });

    it("responds 200 for a valid signed payload and triggers processing", async () => {
      const body = {
        object: "page",
        entry: [
          {
            messaging: [
              { sender: { id: "psid_http" }, message: { text: "hi", mid: "mid.http_test" } },
            ],
          },
        ],
      };

      const res = await signedPost(body);

      assert.strictEqual(res.statusCode, 200);
      await new Promise((r) => setTimeout(r, 300));
      assert.strictEqual(axios.post.mock.calls.length, 2);
      assert.strictEqual(axios.post.mock.calls[1].arguments[1].recipient.id, "psid_http");
    });

    it("responds 200 for a valid but empty payload (no messaging)", async () => {
      const body = { object: "page", entry: [{ standby: [] }] };

      const res = await signedPost(body);

      assert.strictEqual(res.statusCode, 200);
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(axios.post.mock.calls.length, 0);
    });

    it("responds 200 for malformed validly signed body", async () => {
      const body = { object: "page", entry: "not_an_array" };

      const res = await signedPost(body);

      assert.strictEqual(res.statusCode, 200);
      await new Promise((r) => setTimeout(r, 100));
      assert.strictEqual(axios.post.mock.calls.length, 0);
    });

    it("responds 200 for non-page objects (validation catches it, no retries)", async () => {
      const body = { object: "instagram", entry: [] };

      const res = await signedPost(body);

      assert.strictEqual(res.statusCode, 200);
    });
  });

  describe("GET / (healthcheck)", () => {
    it("returns JSON with ok: true", async () => {
      const res = await get("/");
      assert.strictEqual(res.statusCode, 200);
      const parsed = JSON.parse(res.body);
      assert.strictEqual(parsed.ok, true);
      assert.ok(parsed.uptimeMs > 0);
      assert.ok(parsed.stats);
    });
  });
});
