import { errorHandler, httpLogger, notFoundHandler, requireAuth } from "@threads/shared";
import cors from "cors";
import express, { Router } from "express";
import helmet from "helmet";
import { config } from "./config";
import { prisma } from "./db";
import { logger } from "./logger";
import { cartRouter } from "./modules/cart/routes";
import { checkoutRouter } from "./modules/checkout/routes";
import { paymentsRouter } from "./modules/payments/routes";
import { redis } from "./redis";

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);

  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGINS.split(",").map((o) => o.trim()) }));
  app.use(express.json({ limit: "100kb" }));
  app.use(httpLogger(logger));

  const api = Router();
  api.get("/health", async (_req, res) => {
    const [database, redisStatus] = await Promise.all([
      withTimeout(prisma.$queryRaw`SELECT 1`, 2000).then(() => "ok", () => "error"),
      withTimeout(redis.ping(), 2000).then(() => "ok", () => "error"),
    ]);
    const ok = database === "ok" && redisStatus === "ok";
    res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "degraded", service: "shop", database, redis: redisStatus });
  });

  const auth = requireAuth(config.JWT_SECRET);
  api.use("/cart", auth, cartRouter);
  api.use("/checkout", auth, checkoutRouter);
  api.use("/payments", auth, paymentsRouter);
  app.use("/api/shop", api);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
