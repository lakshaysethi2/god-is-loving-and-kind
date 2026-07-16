const { describe, it } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const SERVER_SCRIPT = path.resolve(__dirname, "..", "src", "index.js");

/**
 * Minimal env var template for the server to start.
 */
function makeEnv(port) {
  return {
    ...process.env,
    PORT: String(port),
    VERIFY_TOKEN: "test_verify_token_123",
    PAGE_ACCESS_TOKEN: "test_page_token_123",
    APP_SECRET: "test_app_secret_123",
    LOG_LEVEL: "fatal",
    NODE_ENV: "development",
  };
}

/**
 * Probe the health endpoint until the server responds.
 */
async function waitForServer(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const body = await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/`, { agent: false }, (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => resolve(data));
        });
        req.on("error", reject);
        req.setTimeout(500, () => {
          req.destroy();
          reject(new Error("timeout"));
        });
      });

      const parsed = JSON.parse(body);
      if (parsed.ok === true) return;
    } catch {
      // not ready yet — retry
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  throw new Error(`Server didn't respond on port ${port} within ${timeoutMs}ms`);
}

/**
 * Wait for the server process to exit.
 */
function waitForExit(server) {
  return new Promise((resolve) => {
    server.on("exit", (code, sig) => {
      resolve([code, sig]);
    });

    // Safety timeout — force-kill after 3s
    setTimeout(() => {
      server.kill("SIGKILL");
      resolve([null, "SIGKILL"]);
    }, 3000);
  });
}

describe("graceful shutdown", () => {
  it("exits with code 0 on SIGTERM", async () => {
    const port = 9587;
    const server = spawn("node", [SERVER_SCRIPT], {
      env: makeEnv(port),
      stdio: "pipe",
    });

    try {
      await waitForServer(port);
    } catch (err) {
      server.kill("SIGKILL");
      throw err;
    }

    server.kill("SIGTERM");
    const [exitCode, signal] = await waitForExit(server);

    assert.strictEqual(
      exitCode,
      0,
      `Expected exit code 0 on SIGTERM, got ${exitCode} (signal: ${signal})`,
    );
  });

  it("exits with code 0 on SIGINT", async () => {
    const port = 9588;
    const server = spawn("node", [SERVER_SCRIPT], {
      env: makeEnv(port),
      stdio: "pipe",
    });

    try {
      await waitForServer(port);
    } catch (err) {
      server.kill("SIGKILL");
      throw err;
    }

    server.kill("SIGINT");
    const [exitCode, signal] = await waitForExit(server);

    assert.strictEqual(
      exitCode,
      0,
      `Expected exit code 0 on SIGINT, got ${exitCode} (signal: ${signal})`,
    );
  });
});
