// Token storage. Tokens live in localStorage (read by the API client) and the
// access token is mirrored to a cookie so Next.js middleware can protect routes.
import type { AuthTokens } from "@/types";

const ACCESS = "access_token";
const REFRESH = "refresh_token";
const isBrowser = () => typeof window !== "undefined";

export function getAccessToken(): string | null {
  return isBrowser() ? localStorage.getItem(ACCESS) : null;
}

export function getRefreshToken(): string | null {
  return isBrowser() ? localStorage.getItem(REFRESH) : null;
}

export function setTokens(tokens: AuthTokens) {
  if (!isBrowser()) return;
  localStorage.setItem(ACCESS, tokens.access);
  localStorage.setItem(REFRESH, tokens.refresh);
  document.cookie = `${ACCESS}=${tokens.access}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
}

export function clearTokens() {
  if (!isBrowser()) return;
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
  document.cookie = `${ACCESS}=; path=/; max-age=0`;
}

/** Small JSON helpers for localStorage (used by the mock API) */
export function readJSON<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown) {
  if (isBrowser()) localStorage.setItem(key, JSON.stringify(value));
}
