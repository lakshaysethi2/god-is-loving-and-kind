const { describe, it, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert");
const axios = require("axios");

const {
  configure,
  getDedupCache,
  getEventId,
  getRateLimiter,
  processMessages,
  sendMessage,
  sendTypingIndicator,
  validateWebhookPayload,
} = require("../src/messenger");

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
        Promise.resolve({ data: { recipient_id: "12345", message_id: "mid.abc" } }),
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
        /Request failed/,
      );
    });

    it("uses the configured graph API version", async () => {
      axios.post.mock.mockImplementation(() => Promise.resolve({ data: {} }));

      await sendMessage("u1", "hi");
      const url = axios.post.mock.calls[0].arguments[0];
      assert.ok(url.includes("v99.0"), `Expected v99.0 in URL, got: ${url}`);
    });
  });

  describe("sendTypingIndicator", () => {
    it("sends a sender_action: typing_on POST", async () => {
      axios.post.mock.mockImplementation(() => Promise.resolve({ data: {} }));

      await sendTypingIndicator("psid_typing");

      assert.strictEqual(axios.post.mock.calls.length, 1);
      const call = axios.post.mock.calls[0];
      assert.strictEqual(call.arguments[1].sender_action, "typing_on");
      assert.strictEqual(call.arguments[1].recipient.id, "psid_typing");
      assert.strictEqual(call.arguments[0], "https://graph.facebook.com/v99.0/me/messages");
    });

    it("does not throw on API error (logged internally)", async () => {
      axios.post.mock.mockImplementation(() => Promise.reject(new Error("API error")));

      // Should resolve, not throw
      await assert.doesNotReject(() => sendTypingIndicator("psid_error"));
    });
  });

  describe("getEventId", () => {
    it("returns mid prefixed string for message events with mid", () => {
      assert.strictEqual(getEventId({ message: { mid: "abc123" } }), "mid:abc123");
    });

    it("returns mid prefixed string for postback events with mid", () => {
      assert.strictEqual(getEventId({ postback: { mid: "post_456" } }), "mid:post_456");
    });

    it("returns null for events without mid", () => {
      assert.strictEqual(getEventId({ message: { text: "hi" } }), null);
      assert.strictEqual(getEventId({ postback: { payload: "GET_STARTED" } }), null);
      assert.strictEqual(getEventId({}), null);
    });
  });

  describe("processMessages", () => {
    it("replies to a basic text message", async () => {
      axios.post.mock.mockImplementation(() =>
        Promise.resolve({ data: { recipient_id: "ok", message_id: "mid.1" } }),
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

      // Call 0: typing indicator, Call 1: message
      assert.strictEqual(axios.post.mock.calls.length, 2);
      assert.strictEqual(axios.post.mock.calls[0].arguments[1].sender_action, "typing_on");
      assert.strictEqual(axios.post.mock.calls[0].arguments[1].recipient.id, "psid_1");
      assert.strictEqual(axios.post.mock.calls[1].arguments[1].recipient.id, "psid_1");
      assert.strictEqual(
        axios.post.mock.calls[1].arguments[1].message.text,
        "god is loving and kind",
      );
    });

    it("skips echo events (is_echo: true)", async () => {
      axios.post.mock.mockImplementation(() => Promise.resolve({ data: {} }));

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
      axios.post.mock.mockImplementation(() => Promise.resolve({ data: {} }));

      const body = {
        object: "page",
        entry: [
          {
            messaging: [
              {
                sender: { id: "psid_3" },
                message: {
                  mid: "mid.3",
                  attachments: [{ type: "image", payload: { url: "https://example.com/img.jpg" } }],
                },
              },
            ],
          },
        ],
      };

      await processMessages(body);

      // 2 calls: typing indicator + message
      assert.strictEqual(axios.post.mock.calls.length, 2);
      assert.strictEqual(axios.post.mock.calls[1].arguments[1].recipient.id, "psid_3");
    });

    it("replies to postback events", async () => {
      axios.post.mock.mockImplementation(() => Promise.resolve({ data: {} }));

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

      // 2 calls: typing indicator + message
      assert.strictEqual(axios.post.mock.calls.length, 2);
      assert.strictEqual(axios.post.mock.calls[1].arguments[1].recipient.id, "psid_4");
    });

    it("skips events without a sender ID", async () => {
      axios.post.mock.mockImplementation(() => Promise.resolve({ data: {} }));

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
      axios.post.mock.mockImplementation(() => Promise.resolve({ data: {} }));

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
        Promise.resolve({ data: { recipient_id: "ok", message_id: "mid.x" } }),
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

      // 3 recipients × 2 calls each = 6 total
      assert.strictEqual(axios.post.mock.calls.length, 6);
      const messageCalls = axios.post.mock.calls.filter((c) => c.arguments[1].message);
      assert.strictEqual(messageCalls.length, 3);
      const recipients = messageCalls.map((c) => c.arguments[1].recipient.id);
      assert.ok(recipients.includes("psid_a"));
      assert.ok(recipients.includes("psid_b"));
      assert.ok(recipients.includes("psid_c"));
    });

    it("continues processing when one sendMessage fails", async () => {
      let callCount = 0;
      axios.post.mock.mockImplementation(() => {
        callCount++;
        // Fail the 4th call (0-indexed: 3) — u2's actual message (not typing)
        if (callCount === 4) {
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

      // 3 recipients × 2 calls each = 6 total
      assert.strictEqual(axios.post.mock.calls.length, 6);
      assert.strictEqual(results.length, 3);
      const hasError = results.some((r) => r.status === "rejected");
      assert.ok(hasError, "Expected at least one rejected result");
    });

    it("replies to sticker/GIF messages (attachments)", async () => {
      axios.post.mock.mockImplementation(() => Promise.resolve({ data: {} }));

      const body = {
        object: "page",
        entry: [
          {
            messaging: [
              {
                sender: { id: "psid_sticker" },
                message: {
                  mid: "mid.sticker",
                  attachments: [{ type: "sticker", payload: { sticker_id: 123456 } }],
                },
              },
            ],
          },
        ],
      };

      await processMessages(body);

      // 2 calls: typing indicator + message
      assert.strictEqual(axios.post.mock.calls.length, 2);
      assert.strictEqual(axios.post.mock.calls[1].arguments[1].recipient.id, "psid_sticker");
    });

    it("handles non-array messaging gracefully", async () => {
      const results = await processMessages({
        object: "page",
        entry: [{ messaging: "not_an_array" }],
      });
      assert.strictEqual(axios.post.mock.calls.length, 0);
      assert.deepStrictEqual(results, []);
    });

    it("skips duplicate events with the same mid", async () => {
      getDedupCache().clear();
      axios.post.mock.mockImplementation(() => Promise.resolve({ data: {} }));

      const body = {
        object: "page",
        entry: [
          {
            messaging: [
              { sender: { id: "dup_user" }, message: { text: "hello", mid: "mid.dup" } },
              { sender: { id: "dup_user" }, message: { text: "hello again", mid: "mid.dup" } },
            ],
          },
        ],
      };

      await processMessages(body);

      // Only the first event should produce calls (typing + message = 2)
      assert.strictEqual(axios.post.mock.calls.length, 2);
    });
  });

  describe("rate limiting", () => {
    before(() => {
      // Reconfigure with a very strict rate limiter: 1 message per recipient
      configure("test_page_token", "v99.0", { maxPerWindow: 1, windowMs: 60000 });
    });

    after(() => {
      // Restore default rate limiter for subsequent tests
      configure("test_page_token", "v99.0", { maxPerWindow: 200, windowMs: 60000 });
    });

    beforeEach(() => {
      mock.method(axios, "post", mock.fn());
      axios.post.mock.mockImplementation(() => Promise.resolve({ data: {} }));
    });

    it("skips messages when rate limit is exceeded for a recipient", async () => {
      const body = {
        object: "page",
        entry: [
          {
            messaging: [
              { sender: { id: "rate_limited_user" }, message: { text: "first" } },
              { sender: { id: "rate_limited_user" }, message: { text: "second" } },
              { sender: { id: "rate_limited_user" }, message: { text: "third" } },
            ],
          },
        ],
      };

      const results = await processMessages(body);

      // Only the first message sent (typing + message = 2 calls), rest rate-limited
      assert.strictEqual(axios.post.mock.calls.length, 2);
      // The results only contain the one actual send
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, "fulfilled");
    });

    it("allows different recipients independent rate limits", async () => {
      getRateLimiter().tryConsume("user_a"); // use the slot for user_a
      getRateLimiter().tryConsume("user_a"); // this should fail

      // user_b still has their slot available
      const body = {
        object: "page",
        entry: [
          {
            messaging: [
              { sender: { id: "user_a" }, message: { text: "a1" } },
              { sender: { id: "user_b" }, message: { text: "b1" } },
            ],
          },
        ],
      };

      const results = await processMessages(body);

      // user_a is rate-limited (already consumed), user_b gets typing + message = 2 calls
      assert.strictEqual(axios.post.mock.calls.length, 2);
      // user_b's message is the second call
      assert.strictEqual(axios.post.mock.calls[1].arguments[1].recipient.id, "user_b");
      assert.strictEqual(results.length, 1);
    });
  });

  describe("validateWebhookPayload", () => {
    it("returns null for a valid payload", () => {
      const body = {
        object: "page",
        entry: [
          {
            messaging: [{ sender: { id: "u1" }, message: { text: "hi" } }],
          },
        ],
      };
      assert.strictEqual(validateWebhookPayload(body), null);
    });

    it("returns null for a valid payload with multiple entries", () => {
      const body = {
        object: "page",
        entry: [
          { messaging: [{ sender: { id: "u1" }, message: { text: "a" } }] },
          { messaging: [{ sender: { id: "u2" }, postback: { payload: "x" } }] },
        ],
      };
      assert.strictEqual(validateWebhookPayload(body), null);
    });

    it("returns null for a valid payload without messaging (e.g. standby)", () => {
      const body = { object: "page", entry: [{ standby: [] }] };
      assert.strictEqual(validateWebhookPayload(body), null);
    });

    it("returns null for an empty entry array", () => {
      const body = { object: "page", entry: [] };
      assert.strictEqual(validateWebhookPayload(body), null);
    });

    it("rejects a non-object body", () => {
      assert.ok(validateWebhookPayload(null));
      assert.ok(validateWebhookPayload(undefined));
      assert.ok(validateWebhookPayload("string"));
      assert.ok(validateWebhookPayload(42));
    });

    it("rejects an object without 'page' as object", () => {
      const body = { object: "instagram" };
      const err = validateWebhookPayload(body);
      assert.ok(err);
      assert.ok(err.includes("instagram"));
    });

    it("rejects when entry is not an array", () => {
      const body = { object: "page", entry: "not_an_array" };
      assert.ok(validateWebhookPayload(body));
    });

    it("rejects when entry item is not an object", () => {
      const body = { object: "page", entry: [null] };
      assert.ok(validateWebhookPayload(body));
    });

    it("rejects when messaging is not an array", () => {
      const body = { object: "page", entry: [{ messaging: "bad" }] };
      assert.ok(validateWebhookPayload(body));
    });

    it("rejects when a messaging event is not an object", () => {
      const body = {
        object: "page",
        entry: [{ messaging: [null] }],
      };
      assert.ok(validateWebhookPayload(body));
    });

    it("rejects when sender is present but not an object", () => {
      const body = {
        object: "page",
        entry: [{ messaging: [{ sender: "not_an_object", message: { text: "hi" } }] }],
      };
      assert.ok(validateWebhookPayload(body));
    });
  });
});
