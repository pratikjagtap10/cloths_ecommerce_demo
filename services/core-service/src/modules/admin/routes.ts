// /api/core/admin/*  staff-only order management (JWT of a user with is_staff = true).
// This is the plan's documented fallback for the AdminJS panel:
//   GET  /api/core/admin/orders/?status=PAID   all orders (optionally filtered)
//   POST /api/core/admin/orders/:id/ship/      PAID -> SHIPPED, publishes order.shipped
//   POST /api/core/admin/orders/:id/cancel/    PENDING -> CANCELLED
import { randomUUID } from "node:crypto";
import { ApiError, currentUser, EVENT_TYPES, intParam, publishEvent, queryValue } from "@threads/shared";
import { Router, type RequestHandler } from "express";
import { config } from "../../config";
import { prisma } from "../../db";
import { redis } from "../../redis";
import { orderInclude, orderJson } from "../orders/serializers";
import { changeStatus } from "../orders/service";

const requireStaff: RequestHandler = async (req, _res, next) => {
  const user = await prisma.user.findUnique({ where: { id: currentUser(req).id } });
  if (!user?.isStaff || !user.isActive) {
    next(new ApiError(403, "You do not have permission to perform this action."));
    return;
  }
  next();
};

const STATUSES = ["PENDING", "PAID", "SHIPPED", "CANCELLED"] as const;

export const adminRouter = Router();
adminRouter.use(requireStaff);

adminRouter.get("/orders", async (req, res) => {
  const status = queryValue(req, "status").toUpperCase();
  const orders = await prisma.order.findMany({
    where: STATUSES.includes(status as (typeof STATUSES)[number]) ? { status: status as (typeof STATUSES)[number] } : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: orderInclude,
    take: 200,
  });
  res.json(orders.map(orderJson));
});

adminRouter.post("/orders/:id/ship", async (req, res) => {
  const order = await changeStatus(intParam(req.params.id), "PAID", "SHIPPED");
  // shop-service listens for this and sends the (mock) "your order has shipped" email
  await publishEvent(redis, config.EVENTS_STREAM, {
    id: randomUUID(),
    type: EVENT_TYPES.orderShipped,
    data: { order_id: order.id, user_id: order.userId, email: order.user.email, first_name: order.user.firstName },
  }).catch((err) => req.log.error({ err, orderId: order.id }, "could not publish order.shipped"));
  res.json(orderJson(order));
});

adminRouter.post("/orders/:id/cancel", async (req, res) => {
  const order = await changeStatus(intParam(req.params.id), "PENDING", "CANCELLED");
  res.json(orderJson(order));
});
