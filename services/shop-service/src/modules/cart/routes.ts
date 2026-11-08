// /api/shop/cart/*  (JWT required). Every write returns the whole cart.
import { currentUser, intParam, parse, REQUIRED } from "@threads/shared";
import { Router } from "express";
import { z } from "zod";
import { addItem, cartJson, removeItem, updateItem } from "./service";

const quantity = z
  .number({ required_error: REQUIRED, invalid_type_error: "A valid integer is required." })
  .int("A valid integer is required.")
  .min(1, "Ensure this value is greater than or equal to 1.")
  .max(99, "Ensure this value is less than or equal to 99.");

const addSchema = z.object({
  variant_id: z.number({ required_error: REQUIRED, invalid_type_error: "A valid integer is required." }).int().positive(),
  quantity: quantity.default(1),
});
const updateSchema = z.object({ quantity });

export const cartRouter = Router();

cartRouter.get("/", async (req, res) => {
  res.json(await cartJson(currentUser(req).id));
});

cartRouter.post("/items", async (req, res) => {
  const { id } = currentUser(req);
  const { variant_id, quantity } = parse(addSchema, req.body);
  await addItem(id, variant_id, quantity);
  res.json(await cartJson(id));
});

cartRouter.patch("/items/:id", async (req, res) => {
  const { id } = currentUser(req);
  const { quantity } = parse(updateSchema, req.body);
  await updateItem(id, intParam(req.params.id, "Cart item not found."), quantity);
  res.json(await cartJson(id));
});

cartRouter.delete("/items/:id", async (req, res) => {
  const { id } = currentUser(req);
  await removeItem(id, intParam(req.params.id, "Cart item not found."));
  res.json(await cartJson(id));
});
