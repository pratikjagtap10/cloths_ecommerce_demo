// /api/core/orders/*  (JWT required) a user only ever sees their own orders
import { ApiError, currentUser, intParam } from "@threads/shared";
import { Router } from "express";
import { prisma } from "../../db";
import { orderInclude, orderJson } from "./serializers";

export const ordersRouter = Router();

ordersRouter.get("/", async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: currentUser(req).id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: orderInclude,
  });
  res.json(orders.map(orderJson));
});

ordersRouter.get("/:id", async (req, res) => {
  // Someone else's order -> 404 (not 403), so order ids can't be probed
  const order = await prisma.order.findFirst({
    where: { id: intParam(req.params.id), userId: currentUser(req).id },
    include: orderInclude,
  });
  if (!order) throw new ApiError(404, "Not found.");
  res.json(orderJson(order));
});
