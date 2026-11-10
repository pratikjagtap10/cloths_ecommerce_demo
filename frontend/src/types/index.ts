// Shared TypeScript types. Shapes match the planned Django/FastAPI JSON responses,
// so switching from mock data to the real backend needs no UI changes.

export interface Category {
  id: number;
  name: string;
  slug: string;
  parent: number | null;
}

export interface CategoryRef {
  id: number;
  name: string;
  slug: string;
}

export interface ProductVariant {
  id: number;
  size: string;
  color: string;
  color_hex: string;
  sku: string;
  stock: number;
  price: number;
}

export interface ProductImage {
  id: number;
  url: string;
  alt_text: string;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string;
  category: CategoryRef;
  base_price: number;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  images: ProductImage[];
  variants: ProductVariant[];
}

/** Django REST Framework style paginated response */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ProductQuery {
  category?: string;
  size?: string;
  color?: string;
  min_price?: string;
  max_price?: string;
  search?: string;
  ordering?: string; // "price" | "-price" | "-created_at" | "name"
  featured?: string;
  page?: string;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

export interface CartItem {
  id: number;
  variant_id: number;
  product_name: string;
  product_slug: string;
  size: string;
  color: string;
  color_hex: string;
  quantity: number;
  unit_price: number;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
}

export interface Address {
  full_name: string;
  phone: string;
  line1: string;
  city: string;
  state: string;
  postal_code: string;
}

export type OrderStatus = "PENDING" | "PAID" | "SHIPPED" | "CANCELLED";

export interface OrderItem {
  id: number;
  variant_id: number;
  product_name: string;
  product_slug: string;
  size: string;
  color: string;
  color_hex: string;
  quantity: number;
  unit_price: number;
}

export interface Order {
  id: number;
  user_id: number;
  status: OrderStatus;
  total: number;
  shipping_fee: number;
  address: Address;
  created_at: string;
  items: OrderItem[];
}

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED";

export interface Payment {
  id: number;
  order_id: number;
  amount: number;
  status: PaymentStatus;
}

export interface CheckoutResult {
  order: Order;
  payment: Payment;
}

/** Contract every API implementation (mock or HTTP) must follow */
export interface ApiClient {
  // catalog (Django core service)
  getCategories(): Promise<Category[]>;
  getProducts(query?: ProductQuery): Promise<Paginated<Product>>;
  getProduct(slug: string): Promise<Product | null>;
  // auth (Django core service)
  login(email: string, password: string): Promise<AuthTokens>;
  register(input: RegisterInput): Promise<User>;
  me(): Promise<User>;
  // cart & checkout (FastAPI shop service)
  getCart(): Promise<Cart>;
  addToCart(variantId: number, quantity: number): Promise<Cart>;
  updateCartItem(itemId: number, quantity: number): Promise<Cart>;
  removeCartItem(itemId: number): Promise<Cart>;
  /** idempotencyKey: same key = same order, even if the request is sent twice */
  checkout(address: Address, idempotencyKey?: string): Promise<CheckoutResult>;
  confirmPayment(paymentId: number, success: boolean, idempotencyKey?: string): Promise<Payment>;
  // orders (Django core service)
  getOrders(): Promise<Order[]>;
  getOrder(id: number): Promise<Order | null>;
}
