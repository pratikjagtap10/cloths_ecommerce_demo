// Environment variables, validated at startup: the service refuses to start if one is missing.
import { loadConfig } from "@threads/shared";
import { z } from "zod";

export const config = loadConfig(
  z.object({
    PORT: z.coerce.number().int().default(8000),
    CORE_DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
    JWT_ACCESS_MINUTES: z.coerce.number().int().positive().default(30),
    JWT_REFRESH_DAYS: z.coerce.number().int().positive().default(7),
    INTERNAL_API_KEY: z.string().min(8),
    REDIS_URL: z.string().min(1),
    EVENTS_STREAM: z.string().default("events"),
    CORS_ORIGINS: z.string().default("http://localhost,http://localhost:3000"),
    LOG_LEVEL: z.string().default("info"),
  }),
);

export const tokenSettings = {
  secret: config.JWT_SECRET,
  accessMinutes: config.JWT_ACCESS_MINUTES,
  refreshDays: config.JWT_REFRESH_DAYS,
};
