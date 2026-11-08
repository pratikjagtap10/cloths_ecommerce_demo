// NEXT_PUBLIC_* variables are baked into the bundle at build time.
export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";

// Browser -> API gateway (Nginx)
export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost/api";

// Next.js server (inside Docker network) -> API gateway
export const INTERNAL_API_URL = process.env.API_INTERNAL_URL ?? PUBLIC_API_URL;

export const PAGE_SIZE = 8;
export const FREE_SHIPPING_OVER = 1999;
export const SHIPPING_FEE = 99;
