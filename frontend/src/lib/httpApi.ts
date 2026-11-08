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
  checkout: (address) => request("/shop/checkout/", { method: "POST", body: json({ address }) }),
  confirmPayment: (id, success) =>
    request(`/shop/payments/${id}/confirm/`, { method: "POST", body: json({ success }) }),
  getOrders: () => request("/core/orders/"),
  getOrder: (id) => orNull(request(`/core/orders/${id}/`)),
};
