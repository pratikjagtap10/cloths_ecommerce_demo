import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/AddToCart";
import { ProductCard } from "@/components/ProductCard";
import { api } from "@/lib/api";

// Dynamic route: /products/classic-crew-neck-tee -> params.slug = "classic-crew-neck-tee"
type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await api.getProduct(slug);
  return product
    ? { title: product.name, description: product.description }
    : { title: "Product not found" };
}

export default async function ProductDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await api.getProduct(slug);
  if (!product) notFound(); // renders app/not-found.tsx

  const related = (await api.getProducts({ category: product.category.slug })).results
    .filter((p) => p.id !== product.id)
    .slice(0, 4);

  return (
    <div className="container-page py-10">
      <nav className="mb-6 text-sm text-stone-500" aria-label="Breadcrumb">
        <Link href="/products" className="hover:underline">
          Shop
        </Link>{" "}
        /{" "}
        <Link href={`/products?category=${product.category.slug}`} className="hover:underline">
          {product.category.name}
        </Link>{" "}
        / <span className="text-stone-900">{product.name}</span>
      </nav>

      {/* Server component renders static info; AddToCart is the interactive client island */}
      <AddToCart product={product} />

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-bold">You may also like</h2>
          <div className="mt-6 grid grid-cols-2 gap-6 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
