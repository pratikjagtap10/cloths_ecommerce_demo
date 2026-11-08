// Structured JSON logs (pino). Every HTTP request gets an id: the X-Request-ID sent by
// Nginx (or a new UUID), so one request can be traced across the gateway and services.
import { randomUUID } from "node:crypto";
import pino, { type Logger } from "pino";
import pinoHttp from "pino-http";

export type { Logger };

export function createLogger(service: string, level = process.env.LOG_LEVEL ?? "info"): Logger {
  return pino({ level, base: { service }, timestamp: pino.stdTimeFunctions.isoTime });
}

export function httpLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (req, res) => {
      const header = req.headers["x-request-id"];
      const id = (Array.isArray(header) ? header[0] : header) || randomUUID();
      res.setHeader("X-Request-ID", id);
      return id;
    },
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
    // Docker health checks hit /health every few seconds: don't flood the logs
    autoLogging: { ignore: (req) => (req.url ?? "").includes("/health") },
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  });
}
