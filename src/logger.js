const pino = require("pino");

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const NODE_ENV = process.env.NODE_ENV || "development";

// In production, emit JSON lines for log aggregation.
// In development, use pino-pretty for human-readable output.
const transport =
  NODE_ENV === "production"
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      };

/**
 * The application's root logger.
 *
 * Usage:
 *   const log = require("./logger");
 *   log.info("Server started");
 *   log.warn({ recipientId }, "Rate-limited");
 *   log.error({ err }, "Failed to send");
 */
const logger = pino({
  level: LOG_LEVEL,
  transport,
});

module.exports = logger;
