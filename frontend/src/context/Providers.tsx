"use client";

import { AuthProvider } from "./AuthContext";
import { CartProvider } from "./CartContext";
import { NetworkProvider } from "./NetworkContext";

/** Wraps the whole app with global client-side state */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NetworkProvider>
      <AuthProvider>
        <CartProvider>{children}</CartProvider>
      </AuthProvider>
    </NetworkProvider>
  );
}
