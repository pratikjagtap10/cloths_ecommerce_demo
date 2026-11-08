// core-worker entry point: same image as core-service, different command.
// Consumes the Redis stream as group "core-workers": payment.succeeded -> order PAID + stock reduced.
import { hostname } from "node:os";
import { onShutdown, runConsumer } from "@threads/shared";
import Redis from "ioredis";
import { config } from "./config";
import { prisma } from "./db";
import { handlers } from "./events/handlers";
import { logger } from "./logger";

const consumer = runConsumer({
  redis: new Redis(config.REDIS_URL, { maxRetriesPerRequest: null }),
  stream: config.EVENTS_STREAM,
  group: "core-workers",
  consumer: `core-worker-${hostname()}`,
  handlers,
  logger,
});
logger.info("core-worker started");

onShutdown(async (signal) => {
  logger.info({ signal }, "core-worker shutting down (finishing current event)");
  await consumer.stop();
  await prisma.$disconnect();
});
