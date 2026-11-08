// Outbox relay: publishes unpublished outbox rows to the Redis stream, then marks them
// published. Runs every OUTBOX_INTERVAL_MS and immediately after a payment (flushSoon).
// If publishing works but marking fails, the event is sent again later: that's fine,
// because core-worker ignores event ids it has already processed.
import { publishEvent } from "@threads/shared";
import { config } from "../config";
import { prisma } from "../db";
import { logger } from "../logger";
import { redis } from "../redis";

let running = false;
let timer: NodeJS.Timeout | undefined;

async function flush(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const pending = await prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    for (const row of pending) {
      await publishEvent(redis, config.EVENTS_STREAM, { id: row.id, type: row.type, data: row.payload });
      await prisma.outboxEvent.update({ where: { id: row.id }, data: { publishedAt: new Date() } });
      logger.info({ eventId: row.id, type: row.type }, "event published");
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "outbox relay could not publish, will retry");
  } finally {
    running = false;
  }
}

export const outbox = {
  start() {
    timer = setInterval(() => void flush(), config.OUTBOX_INTERVAL_MS);
  },
  flushSoon() {
    setImmediate(() => void flush());
  },
  async stop() {
    clearInterval(timer);
    await flush();
  },
};
