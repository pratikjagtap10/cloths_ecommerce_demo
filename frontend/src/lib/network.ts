// Network-quality detection used to choose how heavy product images should be.
//
// Strategy (cheapest first):
//   1. Network Information API (Chrome, Edge, Android): navigator.connection gives
//      effectiveType ("slow-2g" | "2g" | "3g" | "4g"), downlink (Mbps) and saveData
//      instantly, without downloading anything.
//   2. Browsers without it (Safari, Firefox): download a small 100 KB file once per
//      session and measure the real speed.
//   3. The user can always override it (Auto / Data saver / HD).

export type NetworkQuality = "low" | "medium" | "high";
export type ImagePreference = "auto" | "data-saver" | "hd";

export interface NetworkInfo {
  quality: NetworkQuality;
  source: "connection-api" | "speed-test" | "fallback" | "url-override";
  effectiveType?: string;
  downlinkMbps?: number;
  saveData?: boolean;
}

/** How images are requested for each quality level (used by ProductImage). */
export const IMAGE_PROFILES: Record<NetworkQuality, { quality: number; widthFactor: number }> = {
  low: { quality: 30, widthFactor: 0.4 }, // only loaded on demand ("Load photo")
  medium: { quality: 45, widthFactor: 0.6 },
  high: { quality: 80, widthFactor: 1 },
};

export const QUALITY_LABELS: Record<NetworkQuality, string> = {
  low: "Slow connection",
  medium: "Average connection",
  high: "Fast connection",
};

const PROBE_URL = "/network-probe.bin"; // 100 KB of random bytes in /public
const PROBE_TIMEOUT_MS = 4000;
const SESSION_KEY = "network_info";

interface NetworkInformationLike extends EventTarget {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
}

export function getConnection(): NetworkInformationLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

/** Pure function: turns raw measurements into a quality level. */
export function classify(input: { effectiveType?: string; downlinkMbps?: number; saveData?: boolean }): NetworkQuality {
  const { effectiveType, downlinkMbps, saveData } = input;
  if (saveData) return "low"; // the user asked the browser/OS to save data
  if (effectiveType === "slow-2g" || effectiveType === "2g") return "low";
  if (downlinkMbps !== undefined && downlinkMbps < 1) return "low";
  if (effectiveType === "3g") return "medium";
  if (downlinkMbps !== undefined && downlinkMbps < 5) return "medium";
  return "high";
}

/** Downloads the probe file and returns Mbps, 0 if it timed out (very slow), null on error. */
export async function measureDownloadMbps(timeoutMs = PROBE_TIMEOUT_MS): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(`${PROBE_URL}?t=${Date.now()}`, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return null;
    const bytes = (await res.arrayBuffer()).byteLength;
    const seconds = Math.max((performance.now() - start) / 1000, 0.001);
    return (bytes * 8) / seconds / 1_000_000;
  } catch (e) {
    return e instanceof DOMException && e.name === "AbortError" ? 0 : null;
  } finally {
    clearTimeout(timer);
  }
}

/** Quality forced through the URL, e.g. /products?network=low (handy for demos/testing). */
export function qualityFromUrl(): NetworkQuality | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("network");
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

export async function detectNetwork(): Promise<NetworkInfo> {
  const forced = qualityFromUrl();
  if (forced) return { quality: forced, source: "url-override" };

  const conn = getConnection();
  if (conn && (conn.effectiveType || conn.saveData)) {
    return {
      quality: classify({ effectiveType: conn.effectiveType, downlinkMbps: conn.downlink, saveData: conn.saveData }),
      source: "connection-api",
      effectiveType: conn.effectiveType,
      downlinkMbps: conn.downlink,
      saveData: conn.saveData,
    };
  }

  // No Network Information API: measure once per browser session
  const cached = sessionStorage.getItem(SESSION_KEY);
  if (cached) return JSON.parse(cached) as NetworkInfo;

  const mbps = await measureDownloadMbps();
  const info: NetworkInfo =
    mbps === null
      ? { quality: "medium", source: "fallback" } // couldn't measure: safe middle ground
      : { quality: classify({ downlinkMbps: mbps }), source: "speed-test", downlinkMbps: Math.round(mbps * 10) / 10 };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(info));
  return info;
}
