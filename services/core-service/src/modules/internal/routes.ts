// /internal/*  service-to-service API, called only by shop-service.
// Protected by X-Internal-Key (in app.ts) and blocked at the Nginx gateway.
//   GET  /internal/variants/:id/  -> live price + stock for the cart
//   POST /internal/orders/        -> create a PENDING order at checkout
import { ApiError, intParam, parse, REQUIRED, requiredString } from "@threads/shared";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { variantPrice } from "../catalog/serializers";
import { orderJson } from "../orders/serializers";
import { createOrder } from "../orders/service";

export const internalRouter = Router();

internalRouter.get("/variants/:id", async (req, res) => {
  const v = await prisma.productVariant.findUnique({
    where: { id: intParam(req.params.id) },
    include: { product: true },
  });
  if (!v) throw new ApiError(404, "Not found.");
  res.json({
    id: v.id,
    product_id: v.productId,
    product_name: v.product.name,
    product_slug: v.product.slug,
    size: v.size,
    color: v.color,
    color_hex: v.colorHex,
    sku: v.sku,
    price: variantPrice(v, v.product.basePrice),
    stock: v.stock,
    is_active: v.product.isActive,
  });
});

const positiveInt = z.number({ required_error: REQUIRED, invalid_type_error: "Must be a number." }).int().positive();

const createOrderSchema = z.object({
  user_id: positiveInt,
  items: z
    .array(z.object({ variant_id: positiveInt, quantity: positiveInt.max(1000) }), { required_error: REQUIRED })
    .min(1, "Your cart is empty."),
  address: z.object(
    {
      full_name: requiredString(150),
      phone: requiredString(20),
      line1: requiredString(255),
      city: requiredString(100),
      state: requiredString(100),
      postal_code: requiredString(20),
    },
    { required_error: REQUIRED },
  ),
});

internalRouter.post("/orders", async (req, res) => {
  const input = parse(createOrderSchema, req.body);
  const order = await createOrder(input);
  req.log.info({ orderId: order.id, userId: order.userId, total: order.total }, "order created");
  res.status(201).json(orderJson(order));
});
