// shop-service consumes "order.shipped" (published by core-service's admin endpoint)
// as consumer group "shop-listeners" and sends the mock "shipped" e-mail.
import { hostname } from "node:os";
import { EVENT_TYPES, runConsumer } from "@threads/shared";
import Redis from "ioredis";
import { config } from "../config";
import { logger } from "../logger";
import { notify } from "../notifications";

export function startListener() {
  return runConsumer({
    redis: new Redis(config.REDIS_URL, { maxRetriesPerRequest: null }),
    stream: config.EVENTS_STREAM,
    group: "shop-listeners",
    consumer: `shop-${hostname()}`,
    logger,
    handlers: {
      [EVENT_TYPES.orderShipped]: async (event) => {
        notify.orderShipped(String(event.data?.email ?? "unknown"), Number(event.data?.order_id));
      },
    },
  });
}
