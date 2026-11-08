import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { ProductImage } from "@/components/ProductImage";
import { api } from "@/lib/api";

// ISR: page is pre-rendered, then regenerated at most every 60 seconds
export const revalidate = 60;

const CATEGORY_TILES = [
  { slug: "men", name: "Men", color: "#1e3a8a", tagline: "Tees, shirts, denim & jackets" },
  { slug: "women", name: "Women", color: "#fb7185", tagline: "Dresses, tops & jeans" },
  { slug: "kids", name: "Kids", color: "#facc15", tagline: "Playful prints & cozy hoodies" },
];

export default async function HomePage() {
  const [featured, newest] = await Promise.all([
    api.getProducts({ featured: "true" }),
    api.getProducts({ ordering: "-created_at" }),
  ]);

  return (
    <>
      {/* Hero banner */}
      <section className="bg-gradient-to-r from-stone-900 to-stone-700 text-white">
        <div className="container-page grid items-center gap-8 py-16 md:grid-cols-2">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-amber-400">New season</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">
              Everyday clothes, made to last.
            </h1>
            <p className="mt-4 max-w-md text-stone-300">
              Soft cottons, breathable linens and denim that fits. Free shipping on orders over ₹1,999.
            </p>
            <div className="mt-8 flex gap-3">
              <Link href="/products" className="btn-primary bg-amber-600 hover:bg-amber-500">
                Shop now
              </Link>
              <Link href="/products?ordering=price" className="btn-secondary border-stone-500 text-white">
                Best prices
              </Link>
            </div>
          </div>
          <div className="mx-auto w-64 sm:w-80">
            <ProductImage color="#d97706" label="Featured garment" className="from-stone-600 to-stone-800" />
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="container-page py-12">
        <h2 className="text-2xl font-bold">Shop by category</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {CATEGORY_TILES.map((c) => (
            <Link
              key={c.slug}
              href={`/products?category=${c.slug}`}
              className="group flex items-center gap-4 rounded-xl border border-stone-200 p-4 transition hover:shadow-md"
            >
              <div className="w-20 shrink-0">
                <ProductImage color={c.color} label={c.name} />
              </div>
              <div>
                <p className="text-lg font-semibold group-hover:underline">{c.name}</p>
                <p className="text-sm text-stone-500">{c.tagline}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products: rendering a list with keys */}
      <section className="container-page py-6">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-bold">Featured</h2>
          <Link href="/products" className="text-sm underline">
            View all
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-6 md:grid-cols-4">
          {featured.results.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <section className="container-page py-12">
        <h2 className="text-2xl font-bold">New arrivals</h2>
        <div className="mt-6 grid grid-cols-2 gap-6 md:grid-cols-4">
          {newest.results.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </>
  );
}
