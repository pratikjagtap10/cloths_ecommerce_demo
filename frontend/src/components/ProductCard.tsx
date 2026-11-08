import Link from "next/link";
import { ProductImage } from "./ProductImage";
import { formatPrice, minPrice, productImageSrc, totalStock, uniqueColors } from "@/lib/format";
import type { Product } from "@/types";

/** Reusable card. Receives data through props and renders it (no state). */
export function ProductCard({ product }: { product: Product }) {
  const colors = uniqueColors(product);
  const soldOut = totalStock(product) === 0;

  return (
    <Link href={`/products/${product.slug}`} className="group block">
      <div className="relative">
        <ProductImage
          color={colors[0]?.hex ?? "#ddd"}
          label={product.name}
          src={colors[0] && productImageSrc(product.slug, colors[0].name, product.images)}
          width={260}
          className="transition group-hover:scale-[1.02]"
        />
        {product.is_featured && (
          <span className="absolute left-2 top-2 rounded bg-stone-900 px-2 py-0.5 text-xs text-white">
            Featured
          </span>
        )}
        {soldOut && (
          <span className="absolute right-2 top-2 rounded bg-red-600 px-2 py-0.5 text-xs text-white">
            Sold out
          </span>
        )}
      </div>
      <div className="mt-3 space-y-1">
        <p className="text-xs uppercase tracking-wide text-stone-500">{product.category.name}</p>
        <h3 className="font-medium group-hover:underline">{product.name}</h3>
        <div className="flex items-center justify-between">
          <span className="font-semibold">{formatPrice(minPrice(product))}</span>
          <span className="flex gap-1">
            {colors.map((c) => (
              <span
                key={c.name}
                title={c.name}
                className="h-3.5 w-3.5 rounded-full border border-stone-300"
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </span>
        </div>
      </div>
    </Link>
  );
}
