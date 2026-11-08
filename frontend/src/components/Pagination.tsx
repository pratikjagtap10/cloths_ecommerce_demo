import Link from "next/link";
import type { ProductQuery } from "@/types";

interface Props {
  page: number;
  totalPages: number;
  query: ProductQuery;
}

/** Server component: plain links, no JavaScript needed */
export function Pagination({ page, totalPages, query }: Props) {
  if (totalPages <= 1) return null;

  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    Object.entries({ ...query, page: String(p) }).forEach(([k, v]) => v && params.set(k, v));
    return `/products?${params.toString()}`;
  };

  return (
    <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
      {page > 1 && (
        <Link href={hrefFor(page - 1)} className="btn-secondary">
          ← Prev
        </Link>
      )}
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <Link
          key={p}
          href={hrefFor(p)}
          aria-current={p === page ? "page" : undefined}
          className={`rounded px-3 py-1.5 ${p === page ? "bg-stone-900 text-white" : "hover:bg-stone-100"}`}
        >
          {p}
        </Link>
      ))}
      {page < totalPages && (
        <Link href={hrefFor(page + 1)} className="btn-secondary">
          Next →
        </Link>
      )}
    </nav>
  );
}
