// Public catalog endpoints (no token needed)
//   GET /api/core/categories/         -> [{id, name, slug, parent}]
//   GET /api/core/products/           -> {count, next, previous, results}  (8 per page)
//   GET /api/core/products/:slug/     -> product with category, images, variants
import { ApiError, queryValue } from "@threads/shared";
import { Router, type Request } from "express";
import { prisma } from "../../db";
import { buildProductQuery, PAGE_SIZE } from "./filters";
import { categoryJson, productInclude, productJson } from "./serializers";

export const catalogRouter = Router();

catalogRouter.get("/categories", async (_req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { id: "asc" } });
  res.json(categories.map(categoryJson));
});

/** Absolute link to another page of the same query, like Django REST Framework builds */
function pageLink(req: Request, page: number): string {
  const url = new URL(req.originalUrl, `${req.protocol}://${req.get("host") ?? "localhost"}`);
  if (page === 1) url.searchParams.delete("page");
  else url.searchParams.set("page", String(page));
  return url.toString();
}

catalogRouter.get("/products", async (req, res) => {
  const { where, orderBy, page } = buildProductQuery((key) => queryValue(req, key));

  const [count, products] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: productInclude,
    }),
  ]);

  const lastPage = Math.max(1, Math.ceil(count / PAGE_SIZE));
  if (page > lastPage) throw new ApiError(404, "Invalid page.");

  res.json({
    count,
    next: page < lastPage ? pageLink(req, page + 1) : null,
    previous: page > 1 ? pageLink(req, page - 1) : null,
    results: products.map(productJson),
  });
});

catalogRouter.get("/products/:slug", async (req, res) => {
  const product = await prisma.product.findFirst({
    where: { slug: req.params.slug, isActive: true },
    include: productInclude,
  });
  if (!product) throw new ApiError(404, "Not found.");
  res.json(productJson(product));
});
