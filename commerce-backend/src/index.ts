import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  logger.info("Commerce backend listening", {
    host: config.host,
    port: config.port,
    env: config.env,
  });
});

const shutdown = (signal: string) => {
  logger.info("Shutting down", { signal });
  server.close(() => process.exit(0));
  // Force-exit if connections hang.
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
