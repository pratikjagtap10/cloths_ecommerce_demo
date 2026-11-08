import type { Order, OrderItem } from "../../../generated/client";

export const orderInclude = { items: { orderBy: { id: "asc" } } } as const;

export const orderJson = (o: Order & { items: OrderItem[] }) => ({
  id: o.id,
  user_id: o.userId,
  status: o.status,
  subtotal: o.subtotal,
  shipping_fee: o.shippingFee,
  total: o.total,
  address: {
    full_name: o.fullName,
    phone: o.phone,
    line1: o.line1,
    city: o.city,
    state: o.state,
    postal_code: o.postalCode,
  },
  created_at: o.createdAt.toISOString(),
  updated_at: o.updatedAt.toISOString(),
  items: o.items.map((i) => ({
    id: i.id,
    variant_id: i.variantId,
    product_name: i.productName,
    product_slug: i.productSlug,
    size: i.size,
    color: i.color,
    color_hex: i.colorHex,
    quantity: i.quantity,
    unit_price: i.unitPrice,
  })),
});
