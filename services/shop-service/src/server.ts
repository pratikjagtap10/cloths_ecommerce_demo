// shop-service entry point: HTTP API + outbox relay + order.shipped listener
import { onShutdown } from "@threads/shared";
import { createApp } from "./app";
import { config } from "./config";
import { prisma } from "./db";
import { startListener } from "./events/listener";
import { outbox } from "./events/outbox";
import { startIdempotencyCleanup } from "./lib/idempotency";
import { logger } from "./logger";
import { redis } from "./redis";

const server = createApp().listen(config.PORT, () => logger.info(`shop-service listening on :${config.PORT}`));
redis.connect().catch((err) => logger.warn({ err: err.message }, "redis not reachable yet, will keep retrying"));
outbox.start();
const listener = startListener();
const stopIdempotencyCleanup = startIdempotencyCleanup();

onShutdown(async (signal) => {
  logger.info({ signal }, "shutting down");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  stopIdempotencyCleanup();
  await outbox.stop();
  await listener.stop();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
});
