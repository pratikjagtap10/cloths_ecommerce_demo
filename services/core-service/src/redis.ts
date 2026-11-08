// Redis connection used to PUBLISH events (e.g. order.shipped from the admin endpoint).
// enableOfflineQueue=false: if Redis is down, commands fail immediately instead of hanging.
import Redis from "ioredis";
import { config } from "./config";

export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
});
