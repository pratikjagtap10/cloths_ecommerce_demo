// Query string -> Prisma `where` / `orderBy` for GET /api/core/products/
//
//   category   slug; a parent category also matches its children ("men" -> men-tshirts, ...)
//   size       variant size (exact)
//   color      variant colour (case-insensitive)
//   min_price / max_price   on base_price
//   featured   true/false
//   search     name or description contains (case-insensitive)
//   ordering   price | -price | name | -name | created_at | -created_at   (default -created_at)
//   page       1-based, 8 per page
// Kept free of database access so it can be unit tested.
import { ApiError } from "@threads/shared";
import type { Prisma } from "../../../generated/client";

export const PAGE_SIZE = 8;

const ORDERING: Record<string, Prisma.ProductOrderByWithRelationInput> = {
  price: { basePrice: "asc" },
  "-price": { basePrice: "desc" },
  base_price: { basePrice: "asc" },
  "-base_price": { basePrice: "desc" },
  name: { name: "asc" },
  "-name": { name: "desc" },
  created_at: { createdAt: "asc" },
  "-created_at": { createdAt: "desc" },
};
export const DEFAULT_ORDERING = "-created_at";

export interface ProductQuery {
  where: Prisma.ProductWhereInput;
  orderBy: Prisma.ProductOrderByWithRelationInput[];
  page: number;
}

function priceParam(value: string, label: string): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new ApiError(400, `${label}: Enter a valid number.`);
  return n;
}

export function buildProductQuery(get: (key: string) => string): ProductQuery {
  const and: Prisma.ProductWhereInput[] = [{ isActive: true }];

  const category = get("category");
  if (category) {
    and.push({ OR: [{ category: { slug: category } }, { category: { parent: { slug: category } } }] });
  }

  // size + color must match the SAME variant ("M in Black", not "M in White + L in Black")
  const size = get("size");
  const color = get("color");
  if (size || color) {
    const variant: Prisma.ProductVariantWhereInput = {};
    if (size) variant.size = size;
    if (color) variant.color = { equals: color, mode: "insensitive" };
    and.push({ variants: { some: variant } });
  }

  const min = priceParam(get("min_price"), "Min price");
  const max = priceParam(get("max_price"), "Max price");
  if (min !== undefined || max !== undefined) and.push({ basePrice: { gte: min, lte: max } });

  const featured = get("featured").toLowerCase();
  if (["true", "1"].includes(featured)) and.push({ isFeatured: true });
  else if (["false", "0"].includes(featured)) and.push({ isFeatured: false });

  const search = get("search");
  if (search) {
    and.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  const ordering = ORDERING[get("ordering")] ?? ORDERING[DEFAULT_ORDERING];

  const pageText = get("page") || "1";
  if (!/^\d+$/.test(pageText) || Number(pageText) < 1) throw new ApiError(404, "Invalid page.");

  return {
    where: { AND: and },
    // ties broken by id so pagination is stable
    orderBy: [ordering, { id: "asc" }],
    page: Number(pageText),
  };
}
