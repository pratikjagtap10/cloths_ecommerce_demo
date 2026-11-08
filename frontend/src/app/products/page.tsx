import type { Metadata } from "next";
import { ProductCard } from "@/components/ProductCard";
import { ProductFilters } from "@/components/ProductFilters";
import { Pagination } from "@/components/Pagination";
import { api } from "@/lib/api";
import { PAGE_SIZE } from "@/lib/config";
import type { ProductQuery } from "@/types";

export const metadata: Metadata = { title: "Shop" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const KEYS: (keyof ProductQuery)[] = [
  "category", "size", "color", "min_price", "max_price", "search", "ordering", "page",
];

/**
 * SSR: rendered on the server for every request because it reads searchParams.
 * The URL is the single source of truth for filters, sorting and pagination.
 */
export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query: ProductQuery = {};
  KEYS.forEach((k) => {
    const v = params[k];
    if (typeof v === "string" && v) query[k] = v;
  });

  const [categories, data] = await Promise.all([api.getCategories(), api.getProducts(query)]);
  const page = Number(query.page) || 1;
  const totalPages = Math.ceil(data.count / PAGE_SIZE);
  const heading = query.search
    ? `Results for “${query.search}”`
    : categories.find((c) => c.slug === query.category)?.name ?? "All products";

  return (
    <div className="container-page py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-3xl font-bold">{heading}</h1>
        <p className="text-sm text-stone-500">
          {data.count} product{data.count === 1 ? "" : "s"}
        </p>
      </div>

      <div className="grid gap-10 md:grid-cols-[220px_1fr]">
        {/* key resets the filter form state whenever the URL query changes */}
        <ProductFilters key={JSON.stringify(query)} categories={categories} query={query} />

        <section>
          {data.results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-stone-300 p-12 text-center text-stone-500">
              No products match these filters. Try removing some.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
              {data.results.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} query={query} />
        </section>
      </div>
    </div>
  );
}
