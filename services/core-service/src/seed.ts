// Loads the demo data from seed-data/*.json (the same JSON the frontend's mock mode uses).
//   node dist/seed.js          -> skipped when products already exist (safe on every start)
//   node dist/seed.js --force  -> wipes catalog, orders and users, then reloads
// Keeps the original ids, then moves the PostgreSQL id sequences past them.
import { readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { logger } from "./logger";

const dir = path.resolve(__dirname, "../seed-data");
const load = <T>(file: string): T => JSON.parse(readFileSync(path.join(dir, file), "utf8")) as T;

interface SeedCategory { id: number; name: string; slug: string; parent: number | null }
interface SeedVariant { id: number; size: string; color: string; color_hex: string; sku: string; stock: number; price: number }
interface SeedProduct {
  id: number; name: string; slug: string; description: string; category: { id: number };
  base_price: number; is_active: boolean; is_featured: boolean; created_at: string;
  images: { id: number; url: string; alt_text: string }[]; variants: SeedVariant[];
}
interface SeedUser { id: number; email: string; password: string; first_name: string; last_name: string }
interface SeedOrder {
  id: number; user_id: number; status: "PENDING" | "PAID" | "SHIPPED" | "CANCELLED"; total: number; shipping_fee: number;
  created_at: string; address: Record<"full_name" | "phone" | "line1" | "city" | "state" | "postal_code", string>;
  items: { id: number; variant_id: number; product_name: string; product_slug: string; size: string; color: string; color_hex: string; quantity: number; unit_price: number }[];
}

const TABLES = ["users", "categories", "products", "product_variants", "product_images", "orders", "order_items"];

async function main() {
  const force = process.argv.includes("--force");
  if (!force && (await prisma.product.count()) > 0) {
    logger.info("seed skipped: products already exist (use --force to reload)");
    return;
  }

  const categories = load<SeedCategory[]>("categories.json");
  const products = load<SeedProduct[]>("products.json");
  const users = load<SeedUser[]>("users.json");
  const orders = load<SeedOrder[]>("orders.json");
  const hashes = await Promise.all(users.map((u) => bcrypt.hash(u.password, 12)));

  await prisma.$transaction(
    async (tx) => {
      if (force) {
        // No RESTART IDENTITY: shop-db still references old user and order ids (carts, payments),
        // so ids must never be handed out a second time. Sequences only move forward (see below).
        await tx.$executeRawUnsafe(
          "TRUNCATE order_items, orders, product_images, product_variants, products, categories, processed_events, users CASCADE",
        );
      }

      for (const [i, u] of users.entries()) {
        const isAdmin = u.email.startsWith("admin@");
        await tx.user.upsert({
          where: { email: u.email.toLowerCase() },
          update: {},
          create: {
            id: u.id,
            email: u.email.toLowerCase(),
            passwordHash: hashes[i],
            firstName: u.first_name,
            lastName: u.last_name,
            isStaff: isAdmin,
            isSuperuser: isAdmin,
          },
        });
      }

      // Parents first, so the parent_id foreign key always exists
      const sorted = [...categories].sort((a, b) => Number(a.parent !== null) - Number(b.parent !== null) || a.id - b.id);
      for (const c of sorted) {
        await tx.category.create({ data: { id: c.id, name: c.name, slug: c.slug, parentId: c.parent } });
      }

      for (const p of products) {
        await tx.product.create({
          data: {
            id: p.id,
            name: p.name,
            slug: p.slug,
            description: p.description,
            categoryId: p.category.id,
            basePrice: p.base_price,
            isActive: p.is_active,
            isFeatured: p.is_featured,
            createdAt: new Date(p.created_at),
            images: { create: p.images.map((img) => ({ id: img.id, url: img.url, altText: img.alt_text })) },
            variants: {
              create: p.variants.map((v) => ({
                id: v.id,
                size: v.size,
                color: v.color,
                colorHex: v.color_hex,
                sku: v.sku,
                stock: v.stock,
                priceOverride: v.price !== p.base_price ? v.price : null,
              })),
            },
          },
        });
      }

      for (const o of orders) {
        await tx.order.create({
          data: {
            id: o.id,
            userId: o.user_id,
            status: o.status,
            subtotal: o.total - o.shipping_fee,
            shippingFee: o.shipping_fee,
            total: o.total,
            fullName: o.address.full_name,
            phone: o.address.phone,
            line1: o.address.line1,
            city: o.address.city,
            state: o.address.state,
            postalCode: o.address.postal_code,
            createdAt: new Date(o.created_at),
            items: {
              create: o.items.map((i) => ({
                id: i.id,
                variantId: i.variant_id,
                productName: i.product_name,
                productSlug: i.product_slug,
                size: i.size,
                color: i.color,
                colorHex: i.color_hex,
                quantity: i.quantity,
                unitPrice: i.unit_price,
              })),
            },
          },
        });
      }

      // We inserted explicit ids: move each sequence past the highest id, but never backwards
      for (const table of TABLES) {
        const [{ seq }] = await tx.$queryRawUnsafe<{ seq: string }[]>(
          `SELECT pg_get_serial_sequence('"${table}"', 'id') AS seq`,
        );
        const [{ last, called }] = await tx.$queryRawUnsafe<{ last: bigint; called: boolean }[]>(
          `SELECT last_value AS last, is_called AS called FROM ${seq}`,
        );
        const [{ max }] = await tx.$queryRawUnsafe<{ max: number }[]>(
          `SELECT COALESCE(MAX(id), 0)::int AS max FROM "${table}"`,
        );
        const next = Math.max(max, called ? Number(last) : 0);
        await tx.$executeRawUnsafe(`SELECT setval('${seq}', ${Math.max(next, 1)}, ${next > 0})`);
      }
    },
    { timeout: 60_000 },
  );

  logger.info(
    { categories: categories.length, products: products.length, variants: products.reduce((n, p) => n + p.variants.length, 0), users: users.length, orders: orders.length },
    "seed data loaded",
  );
}

main()
  .catch((err) => {
    logger.error({ err }, "seed failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
