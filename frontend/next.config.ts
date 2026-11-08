import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" creates a minimal server bundle -> small Docker image
  output: "standalone",

  images: {
    // next/image converts photos to WebP (much smaller than JPEG)
    formats: ["image/webp"],
    // Allowed quality values: low / medium / high profiles in src/lib/network.ts
    qualities: [30, 45, 80],
    // Optimised images are cached on the server and in the browser for 30 days
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  async headers() {
    return [
      {
        // Original product photos: browsers/CDNs may cache them for a day and
        // serve the cached copy while re-validating for a week
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      {
        // The speed-test file must never be cached, or the measurement would be wrong
        source: "/network-probe.bin",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
