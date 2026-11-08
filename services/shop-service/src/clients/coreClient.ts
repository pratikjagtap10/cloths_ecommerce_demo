// HTTP client for core-service's internal API, with three resilience layers:
//
//  1. TIMEOUT          every call is aborted after CORE_TIMEOUT_MS (default 3 s)
//  2. RETRY            up to 2 retries with backoff, ONLY when the request never reached
//                      core-service (connection refused / DNS). A timed-out POST is never
//                      retried: it may have created the order already.
//  3. CIRCUIT BREAKER  (opossum) after >= 50% failures in a 10 s window the breaker
//                      OPENS: calls fail immediately with 503 for 30 s instead of every
//                      user waiting for timeouts; then one trial call (half-open).
//
// 4xx answers from core (404, 409, 400) are normal business answers: they are passed
// through to the user and do NOT count as breaker failures.
import { ApiError, INTERNAL_KEY_HEADER } from "@threads/shared";
import CircuitBreaker from "opossum";
import { config } from "../config";
import { logger } from "../logger";

export const CORE_UNAVAILABLE = "Catalog service is unavailable. Please try again shortly.";

export interface CoreVariant {
  id: number;
  product_id: number;
  product_name: string;
  product_slug: string;
  size: string;
  color: string;
  color_hex: string;
  sku: string;
  price: number;
  stock: number;
  is_active: boolean;
}

export interface CoreOrder {
  id: number;
  user_id: number;
  status: string;
  subtotal: number;
  shipping_fee: number;
  total: number;
  [key: string]: unknown;
}

/** core-service answered with a 4xx: a business answer, not an outage */
class CoreHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail);
  }
}

const RETRYABLE_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function neverReachedServer(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } })?.cause;
  return err instanceof TypeError && RETRYABLE_CODES.has(cause?.code ?? "");
}

async function send(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${config.CORE_SERVICE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", [INTERNAL_KEY_HEADER]: config.INTERNAL_API_KEY },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(config.CORE_TIMEOUT_MS),
  });
  const text = await res.text();
  let json: { detail?: string } | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  if (res.status >= 500) throw new Error(`core-service answered ${res.status}`);
  if (!res.ok) throw new CoreHttpError(res.status, json?.detail ?? `Request failed (${res.status})`);
  return json;
}

async function sendWithRetry(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send(method, path, body);
    } catch (err) {
      if (attempt >= 2 || !neverReachedServer(err)) throw err;
      await sleep(200 * 2 ** attempt); // 200 ms, 400 ms
    }
  }
}

const breaker = new CircuitBreaker(sendWithRetry, {
  timeout: false, // the fetch has its own timeout
  errorThresholdPercentage: 50,
  rollingCountTimeout: 10_000,
  resetTimeout: 30_000,
  volumeThreshold: 3,
  errorFilter: (err) => err instanceof CoreHttpError, // 4xx don't open the breaker
});
breaker.on("open", () => logger.warn("circuit breaker OPEN: core-service calls fail fast for 30s"));
breaker.on("halfOpen", () => logger.info("circuit breaker HALF-OPEN: trying core-service again"));
breaker.on("close", () => logger.info("circuit breaker CLOSED: core-service is healthy"));

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  try {
    return (await breaker.fire(method, path, body)) as T;
  } catch (err) {
    if (err instanceof CoreHttpError) throw new ApiError(err.status, err.detail);
    logger.error({ err: (err as Error)?.message, path, breaker: breaker.opened ? "open" : "closed" }, "core-service call failed");
    throw new ApiError(503, CORE_UNAVAILABLE);
  }
}

export const coreClient = {
  getVariant: (id: number) => call<CoreVariant>("GET", `/internal/variants/${id}/`),
  createOrder: (payload: {
    user_id: number;
    items: { variant_id: number; quantity: number }[];
    address: Record<string, string>;
  }) => call<CoreOrder>("POST", "/internal/orders/", payload),
};

export type CoreClient = typeof coreClient;
