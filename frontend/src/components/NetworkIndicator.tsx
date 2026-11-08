"use client";

// Shows what we detected about the connection and lets the user override it.
import { useNetwork } from "@/context/NetworkContext";
import { QUALITY_LABELS, type ImagePreference } from "@/lib/network";

const ICON = { pending: "⏳", low: "🐢", medium: "📶", high: "⚡" } as const;

export function NetworkIndicator() {
  const { quality, detected, preference, setPreference } = useNetwork();

  const detail = detected
    ? [
        detected.effectiveType?.toUpperCase(),
        detected.downlinkMbps !== undefined ? `~${detected.downlinkMbps} Mbps` : undefined,
        detected.saveData ? "Data saver on" : undefined,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const autoLabel = detected
    ? `Auto: ${QUALITY_LABELS[detected.quality]}${detail ? ` (${detail})` : ""}`
    : "Auto: checking connection…";

  return (
    <label className="flex items-center gap-1.5" title="Image quality adapts to your internet speed">
      <span aria-hidden>{ICON[quality]}</span>
      <span className="hidden sm:inline">Images:</span>
      <select
        value={preference}
        onChange={(e) => setPreference(e.target.value as ImagePreference)}
        className="rounded border border-stone-300 bg-white px-1 py-0.5 text-xs text-stone-800"
        aria-label="Image quality"
      >
        <option value="auto">{autoLabel}</option>
        <option value="data-saver">Data saver (no photos)</option>
        <option value="hd">HD photos</option>
      </select>
    </label>
  );
}
