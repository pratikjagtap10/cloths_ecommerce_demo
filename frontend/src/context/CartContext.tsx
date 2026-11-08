"use client";

// Global cart state: items, item count, and cart actions shared by Navbar, product
// pages, the cart page and checkout.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { USE_MOCK } from "@/lib/config";
import type { Cart } from "@/types";
import { useAuth } from "./AuthContext";

interface CartState {
  cart: Cart;
  count: number;
  loading: boolean;
  add: (variantId: number, quantity: number) => Promise<void>;
  update: (itemId: number, quantity: number) => Promise<void>;
  remove: (itemId: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const EMPTY: Cart = { items: [], subtotal: 0 };
const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [cart, setCart] = useState<Cart>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setCart(await api.getCart());
    } catch {
      setCart(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  // The real cart belongs to the logged-in user (FastAPI needs a JWT), so reload it
  // whenever the user logs in or out. Mock mode keeps one cart per browser.
  useEffect(() => {
    if (authLoading) return;
    if (!user && !USE_MOCK) {
      setCart(EMPTY);
      setLoading(false);
      return;
    }
    refresh();
  }, [authLoading, user, refresh]);

  // Errors are re-thrown so the calling component can show a message
  const add = useCallback(async (variantId: number, quantity: number) => {
    setCart(await api.addToCart(variantId, quantity));
  }, []);

  const update = useCallback(async (itemId: number, quantity: number) => {
    setCart(await api.updateCartItem(itemId, quantity));
  }, []);

  const remove = useCallback(async (itemId: number) => {
    setCart(await api.removeCartItem(itemId));
  }, []);

  const count = cart.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, count, loading, add, update, remove, refresh }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
