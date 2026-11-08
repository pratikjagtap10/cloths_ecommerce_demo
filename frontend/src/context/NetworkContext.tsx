"use client";

// Global "how good is the user's connection?" state.
// Components read `quality` via useNetwork() and adapt (e.g. ProductImage).
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { detectNetwork, getConnection, type ImagePreference, type NetworkInfo, type NetworkQuality } from "@/lib/network";

interface NetworkState {
  /** "pending" until detection finishes: render the lightweight version meanwhile */
  quality: NetworkQuality | "pending";
  detected: NetworkInfo | null;
  preference: ImagePreference;
  setPreference: (p: ImagePreference) => void;
}

const PREF_KEY = "image_preference";
const NetworkContext = createContext<NetworkState | null>(null);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [detected, setDetected] = useState<NetworkInfo | null>(null);
  const [preference, setPreferenceState] = useState<ImagePreference>("auto");

  useEffect(() => {
    const saved = localStorage.getItem(PREF_KEY) as ImagePreference | null;
    if (saved === "data-saver" || saved === "hd") setPreferenceState(saved);

    let cancelled = false;
    const run = () => detectNetwork().then((info) => !cancelled && setDetected(info));

    // Measure after the page has loaded, so the speed test doesn't compete with it
    if (document.readyState === "complete") run();
    else window.addEventListener("load", run, { once: true });

    // Re-check when the connection changes (e.g. Wi-Fi -> mobile data)
    const conn = getConnection();
    conn?.addEventListener("change", run);
    return () => {
      cancelled = true;
      window.removeEventListener("load", run);
      conn?.removeEventListener("change", run);
    };
  }, []);

  const setPreference = useCallback((p: ImagePreference) => {
    setPreferenceState(p);
    localStorage.setItem(PREF_KEY, p);
  }, []);

  // A manual choice always wins over automatic detection
  const quality: NetworkState["quality"] =
    preference === "data-saver" ? "low" : preference === "hd" ? "high" : (detected?.quality ?? "pending");

  return (
    <NetworkContext.Provider value={{ quality, detected, preference, setPreference }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used inside <NetworkProvider>");
  return ctx;
}
