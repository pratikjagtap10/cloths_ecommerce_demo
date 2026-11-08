// Small HTTP helpers used by both services.
import type { Request } from "express";
import { ApiError } from "./errors";

/** Path ids must be positive integers; anything else is simply "not found". */
export function intParam(value: unknown, detail = "Not found."): number {
  const text = String(value ?? "");
  if (!/^\d{1,9}$/.test(text) || Number(text) === 0) throw new ApiError(404, detail);
  return Number(text);
}

/** First value of a query-string parameter as a trimmed string ("" when absent). */
export function queryValue(req: Request, key: string): string {
  const raw = (req.query as Record<string, unknown>)[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

/** Graceful shutdown on SIGTERM (docker stop) and SIGINT (Ctrl+C). */
export function onShutdown(handler: (signal: string) => Promise<void>): void {
  let called = false;
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      if (called) return;
      called = true;
      handler(signal)
        .catch(() => undefined)
        .finally(() => process.exit(0));
      // Hard stop if something hangs
      setTimeout(() => process.exit(1), 10_000).unref();
    });
  }
}
