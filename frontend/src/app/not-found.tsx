import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page py-24 text-center">
      <p className="text-6xl font-bold text-stone-300">404</p>
      <h1 className="mt-4 text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-stone-500">The page or product you are looking for does not exist.</p>
      <Link href="/products" className="btn-primary mt-8">
        Continue shopping
      </Link>
    </div>
  );
}
