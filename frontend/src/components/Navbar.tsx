"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { USE_MOCK } from "@/lib/config";
import { NetworkIndicator } from "./NetworkIndicator";
import type { Category } from "@/types";

/** Client component: it needs browser state (auth, cart count, menu toggle). */
export function Navbar({ categories }: { categories: Category[] }) {
  const { user, loading, logout } = useAuth();
  const { count } = useCart();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    router.push(q ? `/products?search=${encodeURIComponent(q)}` : "/products");
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
      <div className={`text-xs ${USE_MOCK ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-600"}`}>
        <div className="container-page flex items-center justify-between gap-3 py-1">
          <span className="truncate">
            {USE_MOCK
              ? "Mock mode: data comes from JSON files. Demo login: demo@clothstore.com / demo1234"
              : "Free shipping on orders over ₹1,999"}
          </span>
          <NetworkIndicator />
        </div>
      </div>
      <nav className="container-page flex h-16 items-center gap-4">
        <button
          className="md:hidden"
          aria-label="Toggle menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className="text-2xl">☰</span>
        </button>

        <Link href="/" className="text-xl font-bold tracking-tight">
          THREADS<span className="text-amber-600">.</span>
        </Link>

        <ul className="hidden gap-5 text-sm font-medium md:flex">
          <li>
            <Link href="/products" className="hover:text-amber-700">
              All
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c.id}>
              <Link href={`/products?category=${c.slug}`} className="hover:text-amber-700">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>

        <form onSubmit={onSearch} className="ml-auto hidden sm:block">
          <label htmlFor="nav-search" className="sr-only">
            Search products
          </label>
          <input
            id="nav-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clothes…"
            className="input w-48 lg:w-64"
          />
        </form>

        <div className="ml-auto flex items-center gap-4 text-sm sm:ml-0">
          {loading ? null : user ? (
            <>
              <Link href="/orders" className="hidden hover:text-amber-700 sm:inline">
                My Orders
              </Link>
              <span className="hidden text-stone-500 lg:inline">Hi, {user.first_name}</span>
              <button onClick={logout} className="hover:text-amber-700">
                Logout
              </button>
            </>
          ) : (
            <Link href="/login" className="hover:text-amber-700">
              Login
            </Link>
          )}
          <Link href="/cart" className="relative" aria-label={`Cart with ${count} items`}>
            <span className="text-xl">🛒</span>
            {count > 0 && (
              <span className="absolute -right-2 -top-1 rounded-full bg-amber-600 px-1.5 text-xs font-bold text-white">
                {count}
              </span>
            )}
          </Link>
        </div>
      </nav>

      {/* Mobile menu: conditional rendering based on state */}
      {menuOpen && (
        <div className="border-t border-stone-200 md:hidden">
          <div className="container-page space-y-3 py-4">
            <form onSubmit={onSearch}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clothes…"
                className="input w-full"
                aria-label="Search products"
              />
            </form>
            <Link href="/products" className="block" onClick={() => setMenuOpen(false)}>
              All products
            </Link>
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/products?category=${c.slug}`}
                className="block"
                onClick={() => setMenuOpen(false)}
              >
                {c.name}
              </Link>
            ))}
            {user && (
              <Link href="/orders" className="block" onClick={() => setMenuOpen(false)}>
                My Orders
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
