// "Idempotency-Key" middleware for unsafe POST endpoints (checkout, payment confirm).
//
// The client generates a unique key per user action (UUID) and sends it as a header.
// If the request is repeated (slow network retry, double submit, page refresh):
//
//   first request          -> key saved as IN_PROGRESS, the action runs, the response is saved
//   repeat, finished       -> the SAVED response is returned (header Idempotent-Replayed: true);
//                             the action does NOT run again: no second order or payment
//   repeat, still running  -> 409 "already being processed" (+ Retry-After), client retries later
//   same key, other body   -> 422: a key belongs to exactly one request
//
// Requests without the header behave exactly as before (the header is optional).
import { ApiError, currentUser } from "@threads/shared";
import type { RequestHandler, Response } from "express";
import { prisma, Prisma } from "../db";
import { logger } from "../logger";
import {
  IDEMPOTENCY_HEADER,
  IN_PROGRESS_MESSAGE,
  IN_PROGRESS_TIMEOUT_MS,
  KEY_TTL_MS,
  readKey,
  requestFingerprint,
  shouldRemember,
} from "./idempotencyKey";

function inProgress(res: Response): never {
  res.setHeader("Retry-After", "1");
  throw new ApiError(409, IN_PROGRESS_MESSAGE);
}

/** Saves the key as IN_PROGRESS, or answers the request itself. Returns the row id, or null if answered. */
async function claimKey(userId: number, key: string, endpoint: string, requestHash: string, res: Response) {
  try {
    const row = await prisma.idempotencyKey.create({ data: { userId, key, endpoint, requestHash } });
    return row.id;
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }

  // The key exists already: this is a repeated request
  const existing = await prisma.idempotencyKey.findUnique({ where: { userId_key: { userId, key } } });
  if (!existing) inProgress(res); // removed a moment ago by the first request: just retry
  if (existing.endpoint !== endpoint || existing.requestHash !== requestHash) {
    throw new ApiError(422, "Idempotency-Key: This key was already used for a different request.");
  }
  if (existing.status === "COMPLETED") {
    res.setHeader("Idempotent-Replayed", "true");
    res.status(existing.responseCode ?? 200).json(existing.responseBody);
    return null;
  }
  // Still IN_PROGRESS. Take over only if the first attempt looks abandoned (crash mid-request).
  if (Date.now() - existing.updatedAt.getTime() < IN_PROGRESS_TIMEOUT_MS) inProgress(res);
  const { count } = await prisma.idempotencyKey.updateMany({
    where: { id: existing.id, status: "IN_PROGRESS", updatedAt: existing.updatedAt },
    data: { updatedAt: new Date() },
  });
  if (count === 0) inProgress(res); // another retry took it over first
  return existing.id;
}

export const idempotent: RequestHandler = async (req, res, next) => {
  const key = readKey(req.header(IDEMPOTENCY_HEADER));
  if (!key) {
    next();
    return;
  }
  const userId = currentUser(req).id;
  const endpoint = `${req.method} ${req.baseUrl}${req.path}`.replace(/\/+$/, "");
  const rowId = await claimKey(userId, key, endpoint, requestFingerprint(endpoint, req.body), res);
  if (rowId === null) return; // replayed

  res.locals.idempotencyKey = key;

  // Save the outcome BEFORE the response is sent, so an immediate retry already sees it.
  // (Covers success responses and errors, which the error handler also sends with res.json.)
  const send = res.json.bind(res);
  res.json = ((body: unknown) => {
    const status = res.statusCode;
    const save = shouldRemember(status)
      ? prisma.idempotencyKey.update({
          where: { id: rowId },
          data: { status: "COMPLETED", responseCode: status, responseBody: (body ?? null) as Prisma.InputJsonValue },
        })
      : prisma.idempotencyKey.delete({ where: { id: rowId } });
    save
      .catch((err) => req.log.error({ err, key }, "could not save idempotency result"))
      .finally(() => send(body));
    return res;
  }) as Response["json"];

  next();
};

/** Hourly cleanup of keys older than 24 hours */
export function startIdempotencyCleanup() {
  const run = () =>
    prisma.idempotencyKey
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEY_TTL_MS) } } })
      .then(({ count }) => count && logger.info({ count }, "expired idempotency keys removed"))
      .catch((err) => logger.warn({ err: (err as Error).message }, "idempotency cleanup failed"));
  void run();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
