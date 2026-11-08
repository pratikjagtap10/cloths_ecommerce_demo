# Frontend Developer Guide: Threads Cloth Store

This is the Next.js + React storefront, the first of the three services in
`ecommerce_cloth_store_plan.txt`. It can run in two modes:

| Mode | Data comes from | When to use |
| --- | --- | --- |
| **Real backend** (default now) | Django + FastAPI through the Nginx gateway | Full-stack work. See `BACKEND_DEVELOPER_GUIDE.md` |
| **Mock** (`NEXT_PUBLIC_USE_MOCK=true`) | JSON files in `src/mocks/` | UI-only work, no backend needed |

---

## 1. Quick start with Docker (recommended)

**Prerequisite:** Docker Desktop is installed and running.

### Full stack (frontend + backend)

From the project root (`C:\ecommerce_demo`):

```bash
cp .env.example .env          # first time only
docker compose up --build -d
```

Open **http://localhost** (through the Nginx gateway). http://localhost:3000 also works.

### Frontend only, on mock data

```bash
# PowerShell: $env:NEXT_PUBLIC_USE_MOCK="true"; docker compose up --build -d --no-deps frontend
NEXT_PUBLIC_USE_MOCK=true docker compose up --build -d --no-deps frontend
```

Open **http://localhost:3000**. The amber "Mock mode" banner confirms which mode you're in.

| Task                | Command                                   |
| ------------------- | ----------------------------------------- |
| See logs            | `docker compose logs -f frontend`         |
| Check status        | `docker compose ps`                       |
| Stop                | `docker compose down`                     |
| Rebuild after edits | `docker compose up --build -d`            |

This runs the **production build** (small image, no hot reload). After changing
code you must rebuild.

### Hot-reload dev mode in Docker

For day-to-day coding, use the dev container. It mounts your source code, so
changes appear in the browser as soon as you save:

```bash
docker compose --profile dev up --build frontend-dev
```

Open **http://localhost:3001**. Press `Ctrl+C` to stop.

---

## 2. Running without Docker (optional)

**Prerequisite:** Node.js 20+.

```bash
cd frontend
npm install
cp .env.example .env.local     # optional, the defaults already use mock mode
npm run dev                    # http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build (also type-checks)
npm run start      # run the production build
npm run typecheck  # TypeScript check only
```

---

## 3. Demo accounts (mock mode)

| Email                  | Password    |
| ---------------------- | ----------- |
| `demo@clothstore.com`  | `demo1234`  |
| `admin@clothstore.com` | `admin1234` |

The login page has a **"Fill demo credentials"** button. You can also register
new users; they are saved in your browser's localStorage.

The demo user already has 2 past orders (#1001 SHIPPED, #1002 PAID).

---

## 4. What to test in the browser

| Page / feature   | URL                        | What to try                                                       |
| ---------------- | -------------------------- | ----------------------------------------------------------------- |
| Home             | `/`                        | Hero, categories, featured products, new arrivals                 |
| Product list     | `/products`                | Category, size, colour and price filters; sort; pagination        |
| Search           | Navbar search box          | Search for "linen", "jeans" or "dress"                            |
| Product detail   | `/products/floral-wrap-dress` | Pick a colour and size. Crossed-out sizes are out of stock     |
| Stock check      | Product detail             | Add more items than are in stock and you get an error message     |
| Cart             | `/cart`                    | Change quantity, remove items, free shipping over ₹1,999          |
| Protected routes | `/checkout`, `/orders`     | Logged out, you are redirected to `/login?next=...`               |
| Checkout         | `/checkout`                | Address form validation (10-digit mobile, 6-digit PIN code)       |
| Mock payment     | Checkout step 2            | "Pay now" succeeds; "Simulate failure" shows an error             |
| Order success    | `/orders/<id>?placed=1`    | Confirmation banner, and the order now shows status PAID          |
| Order history    | `/orders`                  | Past orders plus the new one                                      |
| 404              | `/products/does-not-exist` | Custom "Page not found"                                           |
| Responsive       | Narrow the browser window  | Hamburger menu, grids collapse                                    |

**Reset mock data:** open browser DevTools → Application → Local Storage →
`http://localhost:3000` → delete the `mock_*` keys (cart, orders, users,
payments) and `access_token`, or just clear the site data.

---

## 5. Project structure

```
frontend/
├── Dockerfile               # multi-stage: deps → dev | builder → runner
├── next.config.ts           # output: "standalone" (small Docker image)
├── .env.example             # environment variables
└── src/
    ├── middleware.ts        # protects /checkout and /orders (cookie check)
    ├── app/                 # App Router: each folder is a route
    │   ├── layout.tsx       # root layout: Navbar + Footer + Providers
    │   ├── page.tsx         # Home (ISR, revalidate 60s)
    │   ├── loading.tsx      # skeleton while server pages load
    │   ├── error.tsx        # error boundary
    │   ├── not-found.tsx    # 404
    │   ├── products/page.tsx           # list (SSR, filters in URL)
    │   ├── products/[slug]/page.tsx    # detail (dynamic route + metadata)
    │   ├── cart/page.tsx               # client component
    │   ├── checkout/page.tsx           # form + mock payment
    │   ├── login/ register/            # react-hook-form + zod
    │   └── orders/ orders/[id]/        # order history + detail/success
    ├── components/          # Navbar, Footer, ProductCard, ProductImage,
    │                        # ProductFilters, Pagination, AddToCart, OrderStatusBadge
    ├── context/             # AuthContext, CartContext, Providers
    ├── lib/
    │   ├── api.ts           # ← the ONLY import pages use: picks mock or http
    │   ├── mockApi.ts       # fake backend: JSON files + localStorage
    │   ├── httpApi.ts       # real backend client (JWT, refresh on 401)
    │   ├── config.ts        # env vars, page size, shipping rules
    │   ├── format.ts        # price/date helpers
    │   └── storage.ts       # token + localStorage helpers
    ├── mocks/               # JSON mock data (see section 6)
    └── types/index.ts       # shared TypeScript types + ApiClient interface
```

---

## 6. Mock data

| File                        | Content                                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| `src/mocks/categories.json` | Men / Women / Kids with sub-categories (parent → child)                    |
| `src/mocks/products.json`   | 17 products and 136 variants (size × colour, stock, SKU, price)            |
| `src/mocks/users.json`      | Demo login users                                                           |
| `src/mocks/orders.json`     | Past orders for the demo user                                              |

The JSON shapes match what the Django/FastAPI APIs will return (Django REST
Framework style pagination: `{count, next, previous, results}`). Some variants
have `stock: 0` on purpose, to show out-of-stock handling.

You can edit the JSON files by hand. For example, add a product by copying an
existing entry and giving it a new unique `id`, `slug` and variant `id`s.

### How the mock API simulates the microservices

| Real system (later)                                       | Mock today                                   |
| --------------------------------------------------------- | -------------------------------------------- |
| Django issues a JWT on login                              | Token `mock-access-<userId>`                 |
| FastAPI asks Django for stock/price before adding to cart | `addToCart` checks `products.json` stock     |
| FastAPI re-checks stock and creates the order at checkout | `checkout` re-validates, saves to localStorage |
| `payment.succeeded` event → Django marks the order PAID   | `confirmPayment` sets PAID, clears the cart  |

A small artificial delay (150–700 ms) makes loading states visible.

---

## 7. Mock mode vs real backend (done ✅)

All pages call `api` from `src/lib/api.ts`, which picks the implementation:

```ts
export const api = USE_MOCK ? mockApi : httpApi;
```

The switch is already wired up:

1. `NEXT_PUBLIC_USE_MOCK` (in `.env`, default `false`) is passed as a build arg in `docker-compose.yml`.
2. `NEXT_PUBLIC_API_URL=http://localhost/api` points the browser at the Nginx gateway.
3. `API_INTERNAL_URL=http://nginx/api` is used for server-side rendering inside Docker.
4. In real mode `app/layout.tsx` calls `connection()`, so pages render per request
   (the APIs aren't reachable during `docker build`).
5. In real mode the cart belongs to the logged-in user, so `CartContext` reloads it on
   login/logout, and "Add to cart" asks guests to log in.

Changing the mode requires a rebuild: `docker compose up --build -d frontend`.

`httpApi.ts` calls these endpoints:

| UI action          | Endpoint                                   | Service |
| ------------------ | ------------------------------------------ | ------- |
| Categories         | `GET /api/core/categories/`                | Django  |
| Product list       | `GET /api/core/products/?category=&size=…` | Django  |
| Product detail     | `GET /api/core/products/{slug}/`           | Django  |
| Login / refresh    | `POST /api/core/auth/login/`, `/refresh/`  | Django  |
| Register / me      | `POST /api/core/auth/register/`, `GET /me/`| Django  |
| Cart               | `GET/POST/PATCH/DELETE /api/shop/cart/...` | FastAPI |
| Checkout           | `POST /api/shop/checkout/`                 | FastAPI |
| Confirm payment    | `POST /api/shop/payments/{id}/confirm/`    | FastAPI |
| Orders             | `GET /api/core/orders/`, `/orders/{id}/`   | Django  |

> `NEXT_PUBLIC_*` variables are baked in at **build time**. Changing them
> requires a rebuild, not just a restart.

---

## 8. Concepts covered (and where to find them)

| Concept                         | Where                                                    |
| ------------------------------- | -------------------------------------------------------- |
| Components & props              | `components/ProductCard.tsx`                             |
| State (`useState`), derived state (`useMemo`) | `components/AddToCart.tsx`                 |
| Effects (`useEffect`) data fetching | `app/orders/page.tsx`                                |
| Context API + custom hooks      | `context/AuthContext.tsx` (`useAuth`), `CartContext.tsx` |
| Conditional rendering, lists & keys | `components/Navbar.tsx`, `app/cart/page.tsx`         |
| Server vs Client components     | `app/products/[slug]/page.tsx` (server) + `AddToCart` (client) |
| SSR                             | `app/products/page.tsx` (reads `searchParams`)           |
| SSG / ISR                       | `app/page.tsx` (`revalidate = 60`)                       |
| CSR                             | `app/cart/page.tsx`                                      |
| Dynamic routes + metadata       | `app/products/[slug]/page.tsx` (`generateMetadata`)      |
| Layouts, loading, error, 404    | `app/layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx` |
| URL as state (filters, pagination) | `components/ProductFilters.tsx`, `Pagination.tsx`     |
| Forms & validation              | `app/checkout`, `login`, `register` (react-hook-form + zod) |
| Protected routes                | `src/middleware.ts`                                      |
| API abstraction / interface     | `types/index.ts` (`ApiClient`), `lib/api.ts`             |
| JWT + refresh token flow        | `lib/httpApi.ts`, `lib/storage.ts`                       |
| Environment variables           | `lib/config.ts`, `.env.example`                          |
| Responsive styling (Tailwind v4)| `app/globals.css` + utility classes                      |
| Accessibility                   | labels, `aria-*`, `role="status"`, alt labels            |
| Docker multi-stage build        | `frontend/Dockerfile`                                    |
| Compose profiles + bind mounts  | `docker-compose.yml` (`frontend-dev`)                    |

---

## 9. Troubleshooting

| Problem                                   | Fix                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `port is already allocated` (3000)        | Stop whatever uses port 3000 (`npm run dev`?), or change `"3000:3000"` to `"3002:3000"` |
| Code changes not visible on :3000         | That is the production container. Rebuild, or use dev mode on :3001  |
| Dev mode doesn't reload on save           | `WATCHPACK_POLLING=true` is set; try saving again or restart the container |
| Added a new npm package, dev container fails | `docker compose --profile dev build --no-cache frontend-dev`      |
| Stuck logged in / weird cart              | Clear site data for localhost:3000 (see section 4)                   |
| Docker build is slow the first time       | Normal: it downloads `node:20-alpine` and npm packages. Later builds use the cache |

---

## 10. Next steps

- [x] Phase 1: Django core service (auth, catalog, orders) with the same JSON shapes
- [x] Phase 2: FastAPI cart & payment service
- [x] Phase 3: Nginx gateway + Redis events, `NEXT_PUBLIC_USE_MOCK=false` by default
- [ ] Add real product images (`product.images[].url`) in `ProductImage.tsx`
- [ ] Frontend tests (Jest + React Testing Library, Playwright end-to-end)
