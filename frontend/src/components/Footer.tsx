import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-stone-200 bg-stone-50">
      <div className="container-page grid gap-8 py-10 text-sm sm:grid-cols-3">
        <div>
          <p className="text-lg font-bold">
            THREADS<span className="text-amber-600">.</span>
          </p>
          <p className="mt-2 text-stone-500">
            A demo clothing store built with Next.js, Django, FastAPI and Docker.
          </p>
        </div>
        <div>
          <p className="font-semibold">Shop</p>
          <ul className="mt-2 space-y-1 text-stone-600">
            <li><Link href="/products?category=men">Men</Link></li>
            <li><Link href="/products?category=women">Women</Link></li>
            <li><Link href="/products?category=kids">Kids</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold">Account</p>
          <ul className="mt-2 space-y-1 text-stone-600">
            <li><Link href="/login">Login</Link></li>
            <li><Link href="/register">Create account</Link></li>
            <li><Link href="/orders">My orders</Link></li>
          </ul>
        </div>
      </div>
      <p className="pb-6 text-center text-xs text-stone-400">
        © {new Date().getFullYear()} Threads demo store. For learning purposes only.
      </p>
    </footer>
  );
}
