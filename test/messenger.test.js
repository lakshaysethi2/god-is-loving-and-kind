const { describe, it, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert");
const axios = require("axios");

const { configure, processMessages, sendMessage } = require("../src/messenger");

describe("messenger module", () => {
  before(() => {
    configure("test_page_token", "v99.0");
  });

  beforeEach(() => {
    // Replace axios.post with a mock before each test
    mock.method(axios, "post", mock.fn());
  });

  after(() => {
    mock.reset();
  });

  describe("sendMessage", () => {
    it("sends a POST to the correct Graph API endpoint", async () => {
      axios.post.mock.mockImplementation(() =>
        Promise.resolve({ data: { recipient_id: "12345", message_id: "mid.abc" } })
      );

      const result = await sendMessage("recipient_psid_1", "god is loving and kind");

      assert.strictEqual(axios.post.mock.calls.length, 1);
      const call = axios.post.mock.calls[0];
      assert.strictEqual(call.arguments[0], "https://graph.facebook.com/v99.0/me/messages");
      assert.deepStrictEqual(call.arguments[1], {
        recipient: { id: "recipient_psid_1" },
        message: { text: "god is loving and kind" },
      });
      assert.deepStrictEqual(call.arguments[2], {
        params: { access_token: "test_page_token" },
      });
      assert.deepStrictEqual(result, {
        recipient_id: "12345",
        message_id: "mid.abc",
      });
    });

    it("rejects on API error", async () => {
      const apiError = new Error("Request failed");
      apiError.response = {
        data: { error: { message: "Rate limit exceeded" } },
      };
      axios.post.mock.mockImplementation(() => Promise.reject(apiError));

      await assert.rejects(
        () => sendMessage("recipient_psid_1", "god is loving and kind"),
        /Request failed/
      );
    });

    it("uses the configured graph API version", async () => {
      axios.post.mock.mockImplementation(() =>
        Promise.resolve({ data: {} })
      );

      await sendMessage("u1", "hi");
      const url = axios.post.mock.calls[0].arguments[0];
      assert.ok(url.includes("v99.0"), `Expected v99.0 in URL, got: ${url}`);
    });
  });

  describe("processMessages", () => {
    it("replies to a basic text message", async () => {
      axios.post.mock.mockImplementation(() =>
        Promise.resolve({ data: { recipient_id: "ok", message_id: "mid.1" } })
      );

      const body = {
        object: "page",
        entry: [
          {
            messaging: [
              {
                sender: { id: "psid_1" },
                message: { text: "hello", mid: "mid.1" },
              },
            ],
          },
        ],
      };

      await processMessages(body);

      assert.strictEqual(axios.post.mock.calls.length, 1);
      assert.strictEqual(
        axios.post.mock.calls[0].arguments[1].recipient.id,
        "psid_1"
      );
    });

    it("skips echo events (is_echo: true)", async () => {
      axios.post.mock.mockImplementation(() =>
        Promise.resolve({ data: {} })
      );

      const body = {
        object: "page",
        entry: [
          {
            messaging: [
              {
                sender: { id: "psid_2" },
                message: { text: "hello", is_echo: true, mid: "mid.2" },
              },
            ],
          },
        ],
      };

      await processMessages(body);

      assert.strictEqual(axios.post.mock.calls.length, 0);
    });

    it("replies to image messages", async () => {
      axios.post.mock.mockImplementation(() =>
        Promise.resolve({ data: {} })
      );

      const body = {
        object: "page",
        entry: [
          {
            messaging: [
              {
                sender: { id: "psid_3" },
                message: {
                  mid: "mid.3",
                  attachments: [
                    { type: "image", payload: { url: "https://example.com/img.jpg" } },
                  ],
                },
              },
            ],
          },
        ],
      };

      await processMessages(body);

      assert.strictEqual(axios.post.mock.calls.length, 1);
      assert.strictEqual(
        axios.post.mock.calls[0].arguments[1].recipient.id,
        "psid_3"
      );
    });

    it("replies to postback events", async () => {
      axios.post.mock.mockImplementation(() =>
        Promise.resolve({ data: {} })
      );

      const body = {
        object: "page",
        entry: [
          {
            messaging: [
              {
                sender: { id: "psid_4" },
                postback: { payload: "GET_STARTED" },
              },
            ],
          },
        ],
      };

      await processMessages(body);

      assert.strictEqual(axios.post.mock.calls.length, 1);
      assert.strictEqual(
        axios.post.mock.calls[0].arguments[1].recipient.id,
        "psid_4"
      );
    });

    it("skips events without a sender ID", async () => {
      axios.post.mock.mockImplementation(() =>
        Promise.resolve({ data: {} })
      );

      const body = {
        object: "page",
        entry: [
          {
            messaging: [
              {
                sender: {},
                message: { text: "hi" },
              },
            ],
          },
        ],
      };

      await processMessages(body);

      assert.strictEqual(axios.post.mock.calls.length, 0);
    });

    it("skips events without message or postback", async () => {
      axios.post.mock.mockImplementation(() =>
        Promise.resolve({ data: {} })
      );

      const body = {
        object: "page",
        entry: [
          {
            messaging: [
              {
                sender: { id: "psid_5" },
                read: { watermark: 12345 },
              },
            ],
          },
        ],
      };

      await processMessages(body);

      assert.strictEqual(axios.post.mock.calls.length, 0);
    });

    it("handles empty entry array gracefully", async () => {
      const results = await processMessages({ object: "page", entry: [] });
      assert.strictEqual(axios.post.mock.calls.length, 0);
      assert.deepStrictEqual(results, []);
    });

    it("handles missing entry field gracefully", async () => {
      const results = await processMessages({ object: "page" });
      assert.strictEqual(axios.post.mock.calls.length, 0);
      assert.deepStrictEqual(results, []);
    });

    it("handles null body gracefully", async () => {
      const results = await processMessages(null);
      assert.strictEqual(axios.post.mock.calls.length, 0);
      assert.deepStrictEqual(results, []);
    });

    it("processes multiple messages in one entry concurrently", async () => {
      axios.post.mock.mockImplementation(() =>
        Promise.resolve({ data: { recipient_id: "ok", message_id: "mid.x" } })
      );

      const body = {
        object: "page",
        entry: [
          {
            messaging: [
              { sender: { id: "psid_a" }, message: { text: "msg1" } },
              { sender: { id: "psid_b" }, message: { text: "msg2" } },
              { sender: { id: "psid_c" }, message: { text: "msg3" } },
            ],
          },
        ],
      };

      await processMessages(body);

      assert.strictEqual(axios.post.mock.calls.length, 3);
      const recipients = axios.post.mock.calls.map(
        (c) => c.arguments[1].recipient.id
      );
      assert.ok(recipients.includes("psid_a"));
      assert.ok(recipients.includes("psid_b"));
      assert.ok(recipients.includes("psid_c"));
    });

    it("continues processing when one sendMessage fails", async () => {
      let callCount = 0;
      axios.post.mock.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error("API failure on second message"));
        }
        return Promise.resolve({ data: { recipient_id: "ok" } });
      });

      const body = {
        object: "page",
        entry: [
          {
            messaging: [
              { sender: { id: "u1" }, message: { text: "a" } },
              { sender: { id: "u2" }, message: { text: "b" } },
              { sender: { id: "u3" }, message: { text: "c" } },
            ],
          },
        ],
      };

      const results = await processMessages(body);

      assert.strictEqual(axios.post.mock.calls.length, 3);
      assert.strictEqual(results.length, 3);
      const hasError = results.some((r) => r.status === "rejected");
      assert.ok(hasError, "Expected at least one rejected result");
    });

    it("replies to sticker/GIF messages (attachments)", async () => {
      axios.post.mock.mockImplementation(() =>
        Promise.resolve({ data: {} })
      );

      const body = {
        object: "page",
        entry: [
          {
            messaging: [
              {
                sender: { id: "psid_sticker" },
                message: {
                  mid: "mid.sticker",
                  attachments: [
                    { type: "sticker", payload: { sticker_id: 123456 } },
                  ],
                },
              },
            ],
          },
        ],
      };

      await processMessages(body);

      assert.strictEqual(axios.post.mock.calls.length, 1);
      assert.strictEqual(
        axios.post.mock.calls[0].arguments[1].recipient.id,
        "psid_sticker"
      );
    });

    it("handles non-array messaging gracefully", async () => {
      const results = await processMessages({
        object: "page",
        entry: [{ messaging: "not_an_array" }],
      });
      assert.strictEqual(axios.post.mock.calls.length, 0);
      assert.deepStrictEqual(results, []);
    });
  });
});
