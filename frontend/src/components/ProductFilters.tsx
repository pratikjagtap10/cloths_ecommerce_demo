"use client";

// Filters live in the URL (?category=men&size=M...). Changing a filter updates the
// URL, and the server component page re-renders with the new results.
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Category, ProductQuery } from "@/types";

const SIZES = ["XS", "S", "M", "L", "XL", "26", "28", "30", "32", "34", "36", "4Y", "6Y", "8Y", "10Y"];
const COLORS = ["Black", "White", "Navy", "Grey", "Beige", "Olive", "Indigo", "Light Blue", "Pink", "Red", "Green"];
const SORTS = [
  { value: "-created_at", label: "Newest" },
  { value: "price", label: "Price: low to high" },
  { value: "-price", label: "Price: high to low" },
  { value: "name", label: "Name A–Z" },
];

interface Props {
  categories: Category[];
  query: ProductQuery;
}

export function ProductFilters({ categories, query }: Props) {
  const router = useRouter();
  const [minPrice, setMinPrice] = useState(query.min_price ?? "");
  const [maxPrice, setMaxPrice] = useState(query.max_price ?? "");

  const apply = (changes: Partial<ProductQuery>) => {
    const next: ProductQuery = { ...query, ...changes, page: undefined }; // reset to page 1
    const params = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => v && params.set(k, v));
    router.push(`/products?${params.toString()}`);
  };

  const roots = categories.filter((c) => c.parent === null);

  return (
    <aside className="space-y-6 text-sm">
      <div>
        <label htmlFor="sort" className="mb-1 block font-semibold">
          Sort by
        </label>
        <select
          id="sort"
          className="input w-full"
          value={query.ordering ?? "-created_at"}
          onChange={(e) => apply({ ordering: e.target.value })}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="mb-2 font-semibold">Category</p>
        <ul className="space-y-1">
          <li>
            <button
              className={!query.category ? "font-semibold text-amber-700" : "hover:underline"}
              onClick={() => apply({ category: undefined })}
            >
              All
            </button>
          </li>
          {roots.map((root) => (
            <li key={root.id}>
              <button
                className={query.category === root.slug ? "font-semibold text-amber-700" : "hover:underline"}
                onClick={() => apply({ category: root.slug })}
              >
                {root.name}
              </button>
              <ul className="ml-3 mt-1 space-y-1 border-l border-stone-200 pl-3">
                {categories
                  .filter((c) => c.parent === root.id)
                  .map((c) => (
                    <li key={c.id}>
                      <button
                        className={query.category === c.slug ? "font-semibold text-amber-700" : "text-stone-600 hover:underline"}
                        onClick={() => apply({ category: c.slug })}
                      >
                        {c.name}
                      </button>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-2 font-semibold">Size</p>
        <div className="flex flex-wrap gap-1.5">
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => apply({ size: query.size === s ? undefined : s })}
              className={`rounded border px-2 py-1 ${query.size === s ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 hover:border-stone-900"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 font-semibold">Colour</p>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => apply({ color: query.color === c ? undefined : c })}
              className={`rounded-full border px-2.5 py-1 ${query.color === c ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 hover:border-stone-900"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({ min_price: minPrice || undefined, max_price: maxPrice || undefined });
        }}
      >
        <p className="mb-2 font-semibold">Price (₹)</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            placeholder="Min"
            aria-label="Minimum price"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="input w-full"
          />
          <span>–</span>
          <input
            type="number"
            min={0}
            placeholder="Max"
            aria-label="Maximum price"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="input w-full"
          />
        </div>
        <button type="submit" className="btn-secondary mt-2 w-full">
          Apply price
        </button>
      </form>

      <button className="text-stone-500 underline" onClick={() => router.push("/products")}>
        Clear all filters
      </button>
    </aside>
  );
}
