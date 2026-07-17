const { describe, it } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const net = require("node:net");

const SERVER_SCRIPT = path.resolve(__dirname, "..", "src", "index.js");

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
        const req = http.get(`http://127.0.0.1:${port}/`, { agent: false }, (res) => {
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
    const port = await getFreePort();
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
    const port = await getFreePort();
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

  it("stop() waits for tracked in-flight promises before resolving", async () => {
    const port = await getFreePort();

    // Load the module fresh with our port
    Object.assign(process.env, makeEnv(port));
    delete require.cache[require.resolve("../src/index")];
    const mod = require("../src/index");
    mod.start();

    try {
      // Track a promise that takes ~200ms to resolve
      let slowResolve;
      const slow = new Promise((resolve) => {
        slowResolve = resolve;
      });

      assert.strictEqual(mod.getInFlightCount(), 0);
      mod.track(slow);
      assert.strictEqual(mod.getInFlightCount(), 1);

      // Start stop() — it should block until slow resolves
      const stopPromise = mod.stop();

      // Give stop() a moment to reach the wait point (server.close callback)
      await new Promise((r) => setTimeout(r, 100));

      // inFlight should still be 1 since slow hasn't resolved yet
      assert.strictEqual(mod.getInFlightCount(), 1);

      // Now resolve the slow promise
      slowResolve();

      // Stop should complete quickly after this
      await stopPromise;
      assert.strictEqual(mod.getInFlightCount(), 0);
    } finally {
      // Ensure clean teardown even if test fails
      await mod.stop();
    }
  });
});
