// Service-to-service authentication for /internal/* endpoints.
// The caller sends "X-Internal-Key: <INTERNAL_API_KEY>". timingSafeEqual avoids leaking
// how many characters matched through response timing. Nginx also blocks /internal/
// from the outside world, so this is a second layer of defence.
import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { ApiError } from "./errors";

export const INTERNAL_KEY_HEADER = "X-Internal-Key";

export function requireInternalKey(expectedKey: string): RequestHandler {
  const expected = Buffer.from(expectedKey);
  return (req, _res, next) => {
    const received = Buffer.from(String(req.header(INTERNAL_KEY_HEADER) ?? ""));
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      next(new ApiError(403, "Invalid or missing internal API key."));
      return;
    }
    next();
  };
}
