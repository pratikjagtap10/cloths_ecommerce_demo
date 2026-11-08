"use client";

// Network-aware product image.
//
//   connection    what is shown
//   ----------    ----------------------------------------------------------------
//   (detecting)   lightweight SVG illustration (≈0 KB, no request)
//   low           SVG illustration only. On the product page a "Load photo"
//                 button fetches a small, low-quality photo on demand
//   medium        optimised photo: smaller width + quality 45 (WebP)
//   high          full-quality photo: quality 80 (WebP)
//
// Photos go through next/image, which resizes, converts to WebP, lazy-loads
// images below the fold and caches the result on the server.
import Image from "next/image";
import { useState } from "react";
import { useNetwork } from "@/context/NetworkContext";
import { IMAGE_PROFILES } from "@/lib/network";

interface Props {
  /** Fallback illustration colour (variant colour) */
  color: string;
  label?: string;
  className?: string;
  /** Photo URL; without it only the illustration is shown */
  src?: string;
  /** Approximate rendered width in CSS px on desktop (drives the requested size) */
  width?: number;
  /** Above-the-fold image: load immediately (only on good connections) */
  priority?: boolean;
  /** Show a "Load photo" button on slow connections (not inside links!) */
  allowLoadOnDemand?: boolean;
}

export function ProductImage({
  color,
  label = "Product image",
  className = "",
  src,
  width = 300,
  priority = false,
  allowLoadOnDemand = false,
}: Props) {
  const { quality } = useNetwork();
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [requestedSrc, setRequestedSrc] = useState<string | null>(null);

  const requestedOnDemand = requestedSrc === src;
  const usable = !!src && failedSrc !== src;
  const showPhoto = usable && quality !== "pending" && (quality !== "low" || requestedOnDemand);
  const loaded = showPhoto && loadedSrc === src;
  const profile = IMAGE_PROFILES[quality === "pending" ? "low" : quality];
  const requestWidth = Math.round(width * profile.widthFactor);
  const sizes = quality === "high" ? `(max-width: 768px) 50vw, ${width}px` : `${requestWidth}px`;

  return (
    <div
      className={`relative aspect-[4/5] overflow-hidden rounded-lg bg-gradient-to-br from-stone-100 to-stone-200 ${className}`}
    >
      {/* Illustration: instant placeholder, and the final image on slow connections */}
      {!loaded && <Illustration color={color} label={showPhoto ? undefined : label} />}

      {showPhoto && (
        <Image
          key={src}
          src={src}
          alt={label}
          fill
          sizes={sizes}
          quality={profile.quality}
          priority={priority && quality === "high"}
          onLoad={() => setLoadedSrc(src)}
          onError={() => setFailedSrc(src)}
          className={`object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}

      {allowLoadOnDemand && usable && quality === "low" && !requestedOnDemand && (
        <button
          type="button"
          onClick={() => setRequestedSrc(src)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold shadow hover:bg-white"
        >
          📷 Load photo (data saver on)
        </button>
      )}
    </div>
  );
}

function Illustration({ color, label }: { color: string; label?: string }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 100 100" className="h-3/4 w-3/4 drop-shadow-md">
        <path
          d="M35 14 L19 21 L6 40 L19 48 L26 41 L26 88 L74 88 L74 41 L81 48 L94 40 L81 21 L65 14 Q50 28 35 14 Z"
          fill={color}
          stroke="#44403c"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
