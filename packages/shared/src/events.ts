// Event bus on Redis STREAMS (instead of Pub/Sub).
//
//   publish : XADD <stream> MAXLEN ~ 10000 * id <uuid> type <type> data <json>
//   consume : consumer GROUPS. Every group receives every event; inside a group each
//             event goes to one consumer. A message stays "pending" until XACK, so if a
//             worker crashes or is stopped, the event is NOT lost: it is re-read on
//             restart (own pending list) or claimed by another consumer (XAUTOCLAIM).
//
// Delivery is "at least once", so handlers must be idempotent (core-service records
// processed event ids in the processed_events table).
import type Redis from "ioredis";
import type { Logger } from "pino";

export interface EventEnvelope<T = unknown> {
  /** Unique event id (UUID), used for idempotency */
  id: string;
  type: string;
  data: T;
}

export interface ReceivedEvent<T = any> extends EventEnvelope<T> {
  /** Redis stream entry id, e.g. "1731050000000-0" */
  streamId: string;
}

export type EventHandler = (event: ReceivedEvent) => Promise<void>;

export const EVENT_TYPES = {
  paymentSucceeded: "payment.succeeded",
  orderShipped: "order.shipped",
} as const;

export async function publishEvent(redis: Redis, stream: string, event: EventEnvelope): Promise<string> {
  const streamId = await redis.xadd(
    stream,
    "MAXLEN",
    "~",
    "10000",
    "*",
    "id",
    event.id,
    "type",
    event.type,
    "data",
    JSON.stringify(event.data),
  );
  return streamId ?? "";
}

type StreamEntry = [id: string, fields: string[]];

function toEvent(streamId: string, fields: string[]): ReceivedEvent {
  const map: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) map[fields[i]] = fields[i + 1];
  let data: unknown = null;
  try {
    data = JSON.parse(map.data ?? "null");
  } catch {
    /* malformed payload: handler receives null */
  }
  return { streamId, id: map.id ?? streamId, type: map.type ?? "unknown", data };
}

export interface ConsumerOptions {
  /** A DEDICATED connection: XREADGROUP BLOCK holds the connection while waiting */
  redis: Redis;
  stream: string;
  group: string;
  consumer: string;
  handlers: Record<string, EventHandler>;
  logger: Logger;
  blockMs?: number;
  /** Pending messages idle longer than this are re-claimed and retried */
  claimIdleMs?: number;
}

export interface RunningConsumer {
  /** Finish the current message, then stop */
  stop(): Promise<void>;
  done: Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function runConsumer(opts: ConsumerOptions): RunningConsumer {
  const { redis, stream, group, consumer, handlers, logger } = opts;
  const blockMs = opts.blockMs ?? 5000;
  const claimIdleMs = opts.claimIdleMs ?? 30_000;
  const log = logger.child({ stream, group, consumer });
  let stopping = false;

  async function ensureGroup() {
    try {
      // "0" = a new group starts from the beginning of the stream, so events published
      // before the worker ever started are still processed (handlers are idempotent).
      await redis.xgroup("CREATE", stream, group, "0", "MKSTREAM");
      log.info("consumer group created");
    } catch (e) {
      if (!String((e as Error).message).includes("BUSYGROUP")) throw e;
    }
  }

  async function processEntries(entries: StreamEntry[]) {
    for (const [streamId, fields] of entries) {
      if (stopping) return;
      if (!fields) {
        // Entry was trimmed from the stream while pending: just acknowledge it
        await redis.xack(stream, group, streamId);
        continue;
      }
      const event = toEvent(streamId, fields);
      const handler = handlers[event.type];
      try {
        if (handler) {
          await handler(event);
          log.info({ eventId: event.id, type: event.type }, "event handled");
        }
        // Types this group doesn't care about are acknowledged and skipped
        await redis.xack(stream, group, streamId);
      } catch (err) {
        // Not acknowledged -> stays pending -> retried by XAUTOCLAIM later
        log.error({ err, eventId: event.id, type: event.type }, "event handler failed, will retry");
      }
    }
  }

  async function readPending() {
    // Messages this consumer read before a crash/restart but never acknowledged
    const res = (await redis.xreadgroup("GROUP", group, consumer, "COUNT", 100, "STREAMS", stream, "0")) as
      | [string, StreamEntry[]][]
      | null;
    for (const [, entries] of res ?? []) await processEntries(entries);
  }

  async function reclaimStale() {
    // Messages any consumer of the group read but didn't acknowledge for claimIdleMs
    const res = (await redis.xautoclaim(stream, group, consumer, claimIdleMs, "0-0", "COUNT", 100)) as [
      string,
      StreamEntry[],
      ...unknown[],
    ];
    if (res?.[1]?.length) {
      log.warn({ count: res[1].length }, "re-processing stale pending events");
      await processEntries(res[1]);
    }
  }

  const done = (async () => {
    let lastClaim = 0;
    let started = false;
    while (!stopping) {
      try {
        if (!started) {
          await ensureGroup();
          await readPending();
          started = true;
          log.info("listening for events");
        }
        if (Date.now() - lastClaim >= claimIdleMs) {
          await reclaimStale();
          lastClaim = Date.now();
        }
        const res = (await redis.xreadgroup(
          "GROUP",
          group,
          consumer,
          "COUNT",
          10,
          "BLOCK",
          blockMs,
          "STREAMS",
          stream,
          ">",
        )) as [string, StreamEntry[]][] | null;
        for (const [, entries] of res ?? []) await processEntries(entries);
      } catch (err) {
        if (stopping) break;
        log.error({ err }, "event consumer error, retrying in 2s");
        await sleep(2000);
      }
    }
    log.info("consumer stopped");
  })();

  return {
    done,
    async stop() {
      stopping = true;
      // Unblock a pending XREADGROUP BLOCK so shutdown is immediate
      redis.disconnect();
      await done;
    },
  };
}
