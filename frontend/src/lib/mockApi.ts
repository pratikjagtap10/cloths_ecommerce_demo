// MOCK API: simulates the Django core service + FastAPI shop service using the
// JSON files in src/mocks and the browser's localStorage. No backend needed.
import categoriesData from "@/mocks/categories.json";
import productsData from "@/mocks/products.json";
import usersData from "@/mocks/users.json";
import ordersData from "@/mocks/orders.json";
import { PAGE_SIZE } from "./config";
import { shippingFor } from "./format";
import { getAccessToken, readJSON, writeJSON } from "./storage";
import type {
  Address, ApiClient, Cart, CartItem, Category, CheckoutResult, Order, Payment,
  Product, ProductQuery, RegisterInput, User,
} from "@/types";

const categories = categoriesData as Category[];
const products = productsData as Product[];
type StoredUser = User & { password: string };

// localStorage keys
const K = {
  users: "mock_users", // users registered in the browser
  cart: "mock_cart",
  orders: "mock_orders",
  payments: "mock_payments",
};

/** Fake network latency so loading states are visible */
const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

/** Error carrying an HTTP-like status, same as the HTTP client throws */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------- helpers ----------
const allUsers = (): StoredUser[] => [
  ...(usersData as StoredUser[]),
  ...readJSON<StoredUser[]>(K.users, []),
];

const toPublicUser = ({ password: _pw, ...user }: StoredUser): User => user;

function currentUserId(): number {
  const token = getAccessToken();
  const id = token?.startsWith("mock-access-") ? Number(token.replace("mock-access-", "")) : NaN;
  if (!id) throw new ApiError(401, "Please log in to continue.");
  return id;
}

function findVariant(variantId: number) {
  for (const p of products) {
    const v = p.variants.find((x) => x.id === variantId);
    if (v) return { product: p, variant: v };
  }
  return null;
}

/** All slugs of a category and its children (Men -> Men T-Shirts, Men Jeans...) */
function categoryFamily(slug: string): string[] {
  const root = categories.find((c) => c.slug === slug);
  if (!root) return [slug];
  return [root.slug, ...categories.filter((c) => c.parent === root.id).map((c) => c.slug)];
}

function cartWithTotals(items: CartItem[]): Cart {
  return { items, subtotal: items.reduce((s, i) => s + i.unit_price * i.quantity, 0) };
}

const readCart = () => readJSON<CartItem[]>(K.cart, []);
const saveCart = (items: CartItem[]) => {
  writeJSON(K.cart, items);
  return cartWithTotals(items);
};

const localOrders = () => readJSON<Order[]>(K.orders, []);
const allOrders = () => [...(ordersData as Order[]), ...localOrders()];

// ---------- API ----------
export const mockApi: ApiClient = {
  async getCategories() {
    return categories;
  },

  async getProducts(query: ProductQuery = {}) {
    let list = products.filter((p) => p.is_active);

    if (query.category) {
      const family = categoryFamily(query.category);
      list = list.filter((p) => family.includes(p.category.slug));
    }
    if (query.featured === "true") list = list.filter((p) => p.is_featured);
    if (query.size) list = list.filter((p) => p.variants.some((v) => v.size === query.size));
    if (query.color) list = list.filter((p) => p.variants.some((v) => v.color === query.color));
    if (query.min_price) list = list.filter((p) => p.base_price >= Number(query.min_price));
    if (query.max_price) list = list.filter((p) => p.base_price <= Number(query.max_price));
    if (query.search) {
      const q = query.search.toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
      );
    }

    const sorters: Record<string, (a: Product, b: Product) => number> = {
      price: (a, b) => a.base_price - b.base_price,
      "-price": (a, b) => b.base_price - a.base_price,
      name: (a, b) => a.name.localeCompare(b.name),
      "-created_at": (a, b) => b.created_at.localeCompare(a.created_at),
    };
    list = [...list].sort(sorters[query.ordering ?? "-created_at"] ?? sorters["-created_at"]);

    const page = Math.max(1, Number(query.page) || 1);
    const start = (page - 1) * PAGE_SIZE;
    return {
      count: list.length,
      next: start + PAGE_SIZE < list.length ? String(page + 1) : null,
      previous: page > 1 ? String(page - 1) : null,
      results: list.slice(start, start + PAGE_SIZE),
    };
  },

  async getProduct(slug) {
    return products.find((p) => p.slug === slug) ?? null;
  },

  async login(email, password) {
    await delay();
    const user = allUsers().find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
    );
    if (!user) throw new ApiError(401, "Invalid email or password.");
    return { access: `mock-access-${user.id}`, refresh: `mock-refresh-${user.id}` };
  },

  async register(input: RegisterInput) {
    await delay();
    const users = allUsers();
    if (users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
      throw new ApiError(400, "A user with this email already exists.");
    }
    const user: StoredUser = { ...input, id: Math.max(...users.map((u) => u.id)) + 1 };
    writeJSON(K.users, [...readJSON<StoredUser[]>(K.users, []), user]);
    return toPublicUser(user);
  },

  async me() {
    const id = currentUserId();
    const user = allUsers().find((u) => u.id === id);
    if (!user) throw new ApiError(401, "Session expired.");
    return toPublicUser(user);
  },

  async getCart() {
    return cartWithTotals(readCart());
  },

  async addToCart(variantId, quantity) {
    await delay(150);
    // Simulates FastAPI -> Django "GET /internal/variants/{id}/" stock & price check
    const found = findVariant(variantId);
    if (!found) throw new ApiError(404, "Product variant not found.");
    const { product, variant } = found;
    const items = readCart();
    const existing = items.find((i) => i.variant_id === variantId);
    const newQty = (existing?.quantity ?? 0) + quantity;
    if (newQty > variant.stock) {
      throw new ApiError(
        400,
        `Only ${variant.stock} left in stock for ${variant.color} / ${variant.size}.`,
      );
    }
    if (existing) {
      existing.quantity = newQty;
    } else {
      items.push({
        id: Date.now(),
        variant_id: variant.id,
        product_name: product.name,
        product_slug: product.slug,
        size: variant.size,
        color: variant.color,
        color_hex: variant.color_hex,
        quantity,
        unit_price: variant.price,
      });
    }
    return saveCart(items);
  },

  async updateCartItem(itemId, quantity) {
    const items = readCart();
    const item = items.find((i) => i.id === itemId);
    if (!item) throw new ApiError(404, "Cart item not found.");
    const stock = findVariant(item.variant_id)?.variant.stock ?? 0;
    if (quantity > stock) throw new ApiError(400, `Only ${stock} left in stock.`);
    item.quantity = Math.max(1, quantity);
    return saveCart(items);
  },

  async removeCartItem(itemId) {
    return saveCart(readCart().filter((i) => i.id !== itemId));
  },

  async checkout(address: Address): Promise<CheckoutResult> {
    await delay(500);
    const userId = currentUserId();
    const items = readCart();
    if (items.length === 0) throw new ApiError(400, "Your cart is empty.");

    // Re-verify stock & price (like FastAPI calling Django before creating the order)
    for (const i of items) {
      const v = findVariant(i.variant_id)?.variant;
      if (!v || v.stock < i.quantity) {
        throw new ApiError(
          409,
          `${i.product_name} (${i.color} / ${i.size}) is no longer available in that quantity.`,
        );
      }
    }

    const subtotal = cartWithTotals(items).subtotal;
    const shipping_fee = shippingFor(subtotal);
    const order: Order = {
      id: Math.max(...allOrders().map((o) => o.id)) + 1,
      user_id: userId,
      status: "PENDING",
      total: subtotal + shipping_fee,
      shipping_fee,
      address,
      created_at: new Date().toISOString(),
      items: items.map((i, idx) => ({ ...i, id: idx + 1 })),
    };
    const payment: Payment = {
      id: Date.now(),
      order_id: order.id,
      amount: order.total,
      status: "PENDING",
    };

    writeJSON(K.orders, [...localOrders(), order]);
    writeJSON(K.payments, [...readJSON<Payment[]>(K.payments, []), payment]);
    return { order, payment };
  },

  async confirmPayment(paymentId, success) {
    await delay(700);
    const payments = readJSON<Payment[]>(K.payments, []);
    const payment = payments.find((p) => p.id === paymentId);
    if (!payment) throw new ApiError(404, "Payment not found.");
    payment.status = success ? "SUCCESS" : "FAILED";
    writeJSON(K.payments, payments);

    if (success) {
      // Simulates the "payment.succeeded" event: Django marks the order PAID,
      // FastAPI clears the cart.
      const orders = localOrders();
      const order = orders.find((o) => o.id === payment.order_id);
      if (order) order.status = "PAID";
      writeJSON(K.orders, orders);
      writeJSON(K.cart, []);
    }
    return payment;
  },

  async getOrders() {
    await delay();
    const userId = currentUserId();
    return allOrders()
      .filter((o) => o.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async getOrder(id) {
    await delay();
    const userId = currentUserId();
    return allOrders().find((o) => o.id === id && o.user_id === userId) ?? null;
  },
};
