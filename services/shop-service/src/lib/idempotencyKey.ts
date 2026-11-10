// Pure helpers for the Idempotency-Key support (no database access, so they are unit tested).
import { createHash } from "node:crypto";
import { ApiError } from "@threads/shared";

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

/** How long a key is remembered */
export const KEY_TTL_MS = 24 * 60 * 60 * 1000;

/** An IN_PROGRESS key older than this is treated as abandoned (e.g. the process crashed) */
export const IN_PROGRESS_TIMEOUT_MS = 60_000;

/** Shown when the same key arrives while the first request is still running */
export const IN_PROGRESS_MESSAGE = "This request is already being processed. Please wait a moment.";

const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,100}$/;

/** undefined/empty header -> null (feature not used); invalid header -> 400 */
export function readKey(raw: string | undefined): string | null {
  if (raw === undefined || raw.trim() === "") return null;
  const key = raw.trim();
  if (!KEY_PATTERN.test(key)) {
    throw new ApiError(400, "Idempotency-Key: Use 8-100 characters: letters, digits, '-', '_', ':' or '.'.");
  }
  return key;
}

/** Same endpoint + same body -> same fingerprint. Detects a key reused for a different request. */
export function requestFingerprint(endpoint: string, body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify([endpoint, body ?? null]))
    .digest("hex");
}

/**
 * Which outcomes are remembered and replayed:
 *  - success (2xx) and business conflicts (409 e.g. out of stock): the action really ran -> replay
 *  - validation errors (400/422), auth errors, 5xx/503: nothing happened (or we can't be sure)
 *    -> forget the key, so the client may retry with the same key after fixing the problem
 */
export const shouldRemember = (status: number) => status < 400 || status === 409;
