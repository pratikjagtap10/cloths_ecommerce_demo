import { loadConfig } from "@threads/shared";
import { z } from "zod";

export const config = loadConfig(
  z.object({
    PORT: z.coerce.number().int().default(8001),
    SHOP_DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
    INTERNAL_API_KEY: z.string().min(8),
    CORE_SERVICE_URL: z.string().url(),
    CORE_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
    REDIS_URL: z.string().min(1),
    EVENTS_STREAM: z.string().default("events"),
    OUTBOX_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
    CORS_ORIGINS: z.string().default("http://localhost,http://localhost:3000"),
    LOG_LEVEL: z.string().default("info"),
  }),
);
