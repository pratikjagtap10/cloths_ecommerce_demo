// Prisma (camelCase) -> API JSON (snake_case), matching frontend/src/types/index.ts
import type { Category, Product, ProductImage, ProductVariant } from "../../../generated/client";

export const productInclude = {
  category: { select: { id: true, name: true, slug: true } },
  images: { orderBy: { id: "asc" } },
  variants: { orderBy: { id: "asc" } },
} as const;

type ProductWithRelations = Product & {
  category: Pick<Category, "id" | "name" | "slug">;
  images: ProductImage[];
  variants: ProductVariant[];
};

export const variantPrice = (v: Pick<ProductVariant, "priceOverride">, basePrice: number) =>
  v.priceOverride ?? basePrice;

export const categoryJson = (c: Category) => ({ id: c.id, name: c.name, slug: c.slug, parent: c.parentId });

export const productJson = (p: ProductWithRelations) => ({
  id: p.id,
  name: p.name,
  slug: p.slug,
  description: p.description,
  category: { id: p.category.id, name: p.category.name, slug: p.category.slug },
  base_price: p.basePrice,
  is_active: p.isActive,
  is_featured: p.isFeatured,
  created_at: p.createdAt.toISOString(),
  images: p.images.map((i) => ({ id: i.id, url: i.url, alt_text: i.altText })),
  variants: p.variants.map((v) => ({
    id: v.id,
    size: v.size,
    color: v.color,
    color_hex: v.colorHex,
    sku: v.sku,
    stock: v.stock,
    price: variantPrice(v, p.basePrice),
  })),
});
