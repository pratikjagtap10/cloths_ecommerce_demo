// HTTP API: talks to the real backend through the Nginx API gateway:
//   /api/core/*  -> Django core service
//   /api/shop/*  -> FastAPI cart & payment service
// Used when NEXT_PUBLIC_USE_MOCK=false.
import { INTERNAL_API_URL, PUBLIC_API_URL } from "./config";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./storage";
import { ApiError } from "./mockApi";
import type { ApiClient, Paginated, Product, ProductQuery } from "@/types";

const baseUrl = () => (typeof window === "undefined" ? INTERNAL_API_URL : PUBLIC_API_URL);

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  const res = await fetch(`${baseUrl()}/core/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  setTokens({ access: data.access, refresh: data.refresh ?? refresh });
  return true;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });

  // Access token expired -> try refresh once, then repeat the request
  if (res.status === 401 && retry && (await refreshAccessToken())) {
    return request<T>(path, init, false);
  }
  if (res.status === 401) clearTokens();

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body.detail ?? body.error ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const toQueryString = (q: ProductQuery) => {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => v && params.set(k, v));
  const s = params.toString();
  return s ? `?${s}` : "";
};

const json = (body: unknown) => JSON.stringify(body);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const IN_PROGRESS = "already being processed"; // shop-service's 409 for a duplicate still running

/**
 * POST with an Idempotency-Key, retried automatically with the SAME key when:
 *  - the network failed (fetch threw: offline, connection dropped; maybe the server got it)
 *  - the gateway/service answered 502/503/504
 *  - the first identical request is still being processed (409)
 * Because the key is the same, the backend never runs the action twice.
 */
async function idempotentPost<T>(path: string, body: unknown, key?: string): Promise<T> {
  const init: RequestInit = { method: "POST", body: json(body), headers: key ? { "Idempotency-Key": key } : {} };
  if (!key) return request<T>(path, init);
  for (let attempt = 1; ; attempt++) {
    try {
      return await request<T>(path, init);
    } catch (e) {
      const networkError = e instanceof TypeError;
      const retryable =
        networkError ||
        (e instanceof ApiError && ([502, 503, 504].includes(e.status) || (e.status === 409 && e.message.includes(IN_PROGRESS))));
      if (!retryable || attempt >= 3) {
        if (networkError) throw new ApiError(0, "Network problem. Please check your connection and try again.");
        throw e;
      }
      await sleep(1000 * attempt); // 1 s, then 2 s
    }
  }
}

async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export const httpApi: ApiClient = {
  getCategories: () => request("/core/categories/"),
  getProducts: (q = {}) => request<Paginated<Product>>(`/core/products/${toQueryString(q)}`),
  getProduct: (slug) => orNull(request<Product>(`/core/products/${slug}/`)),
  login: (email, password) =>
    request("/core/auth/login/", { method: "POST", body: json({ email, password }) }),
  register: (input) => request("/core/auth/register/", { method: "POST", body: json(input) }),
  me: () => request("/core/auth/me/"),
  getCart: () => request("/shop/cart/"),
  addToCart: (variant_id, quantity) =>
    request("/shop/cart/items/", { method: "POST", body: json({ variant_id, quantity }) }),
  updateCartItem: (id, quantity) =>
    request(`/shop/cart/items/${id}/`, { method: "PATCH", body: json({ quantity }) }),
  removeCartItem: (id) => request(`/shop/cart/items/${id}/`, { method: "DELETE" }),
  checkout: (address, key) => idempotentPost("/shop/checkout/", { address }, key),
  confirmPayment: (id, success, key) => idempotentPost(`/shop/payments/${id}/confirm/`, { success }, key),
  getOrders: () => request("/core/orders/"),
  getOrder: (id) => orNull(request(`/core/orders/${id}/`)),
};
