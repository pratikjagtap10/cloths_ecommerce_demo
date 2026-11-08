// HTTP entry point for core-service
import { onShutdown } from "@threads/shared";
import { createApp } from "./app";
import { config } from "./config";
import { prisma } from "./db";
import { logger } from "./logger";
import { redis } from "./redis";

const server = createApp().listen(config.PORT, () => logger.info(`core-service listening on :${config.PORT}`));
redis.connect().catch((err) => logger.warn({ err }, "redis not reachable yet (only needed to publish events)"));

onShutdown(async (signal) => {
  logger.info({ signal }, "shutting down");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
});
