// Publisher connection (outbox relay, health check). Fails fast while Redis is down,
// so the relay simply retries on its next tick instead of hanging.
import Redis from "ioredis";
import { config } from "./config";

export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
});
