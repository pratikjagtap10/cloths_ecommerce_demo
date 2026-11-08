// Express app: middleware chain + routes. No listen() here, so tests can use supertest.
import { errorHandler, httpLogger, notFoundHandler, requireAuth, requireInternalKey } from "@threads/shared";
import cors from "cors";
import express, { Router } from "express";
import helmet from "helmet";
import { config, tokenSettings } from "./config";
import { prisma } from "./db";
import { logger } from "./logger";
import { adminRouter } from "./modules/admin/routes";
import { authRouter } from "./modules/auth/routes";
import { catalogRouter } from "./modules/catalog/routes";
import { internalRouter } from "./modules/internal/routes";
import { ordersRouter } from "./modules/orders/routes";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true); // behind Nginx: use X-Forwarded-Proto / X-Forwarded-For

  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGINS.split(",").map((o) => o.trim()) }));
  app.use(express.json({ limit: "100kb" }));
  app.use(httpLogger(logger));

  // Public API, reached through the gateway at /api/core/*
  // (Express routing is not strict, so "/products" also matches "/products/")
  const api = Router();
  api.get("/health", async (_req, res) => {
    const database = await prisma.$queryRaw`SELECT 1`.then(() => "ok", () => "error");
    res.status(database === "ok" ? 200 : 503).json({ status: database === "ok" ? "ok" : "degraded", service: "core", database });
  });
  api.use("/auth", authRouter);
  api.use("/", catalogRouter);
  api.use("/orders", requireAuth(tokenSettings.secret), ordersRouter);
  api.use("/admin", requireAuth(tokenSettings.secret), adminRouter);
  app.use("/api/core", api);

  // Service-to-service API (blocked at the gateway, protected by the internal key)
  app.use("/internal", requireInternalKey(config.INTERNAL_API_KEY), internalRouter);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
