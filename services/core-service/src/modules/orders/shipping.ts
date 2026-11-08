// Shipping rule (same as the frontend's FREE_SHIPPING_OVER / SHIPPING_FEE)
export const FREE_SHIPPING_THRESHOLD = 1999;
export const SHIPPING_FEE = 99;

export const shippingFor = (subtotal: number) => (subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE);
