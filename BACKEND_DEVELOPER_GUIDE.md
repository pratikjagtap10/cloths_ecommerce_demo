# Backend Developer Guide (Node.js edition)

How to work on the backend day to day. For the architecture overview and running the whole app,
start with [README.md](README.md).

**Stack:** Node.js 20 · TypeScript (strict) · Express 5 · Prisma 6 + PostgreSQL 16 · Zod ·
jsonwebtoken + bcryptjs · ioredis (Redis Streams) · opossum (circuit breaker) · pino (JSON logs) ·
Vitest · Newman (Postman) · Docker Compose.

---

## 1. Setup

1. Install **Node.js 20+** and **Docker Desktop**.
2. Install dependencies once, from the repo root. This is an npm workspace, so one install covers all packages:
   ```bash
   npm install
   ```
3. Build the shared package and generate both Prisma clients:
   ```bash
   npm run build
   ```

> Always run `npm install` from the **repo root**, never inside a service folder. A single
> `package-lock.json` at the root covers `packages/*` and `services/*`. The `frontend/` folder is
> separate and has its own lockfile.

---

## 2. Two ways to run the backend

### A) Everything in Docker (closest to production)

```bash
docker compose up --build -d          # rebuild after every code change
docker compose logs -f shop-service
```

### B) Hybrid: databases in Docker, services on your machine with hot reload (fastest loop)

```bash
docker compose up -d core-db shop-db redis       # infrastructure only
cp .env.local.example .env.local                 # localhost URLs for the services

npm run build -w @threads/shared                 # once, and after changing packages/shared

# terminal 1: core-service (first time also: migrate + seed)
cd services/core-service
npm run migrate:dev        # applies migrations to core-db on localhost:5433
npm run seed               # demo data (skipped if products exist)
npm run dev                # http://localhost:8000, restarts on save

# terminal 2: core-worker
cd services/core-service && npm run dev:worker

# terminal 3: shop-service
cd services/shop-service
npm run migrate:dev && npm run dev               # http://localhost:8001
```

In mode B there's no gateway, so call the services directly: `http://localhost:8000/api/core/...` and
`http://localhost:8001/api/shop/...`. If the full Docker stack is also running, stop its
`core-service`, `core-worker` and `shop-service` containers first: they use the same ports and would
also consume the same events.

---

## 3. Code layout

```
packages/shared/src/           imported as "@threads/shared" by both services
  errors.ts        ApiError + error handler -> always {"detail": "..."} (+ optional "errors")
  validate.ts      Zod parse() -> 400/422 with "<Field>: <message>", loadConfig() for env vars
  auth.ts          signToken / verifyToken / requireAuth middleware (JWT HS256)
  internalKey.ts   requireInternalKey (X-Internal-Key, timing-safe compare)
  logger.ts        pino logger + pino-http with X-Request-ID
  events.ts        Redis Streams: publishEvent(), runConsumer() (groups, ack, autoclaim)
  http.ts          intParam(), queryValue(), onShutdown()

services/core-service/
  prisma/schema.prisma           User, Category, Product, ProductVariant, ProductImage,
                                 Order, OrderItem, ProcessedEvent
  prisma/migrations/             SQL migrations (committed)
  seed-data/*.json               demo data (same JSON as the frontend mocks)
  src/app.ts                     middleware chain + route mounting
  src/server.ts                  HTTP entry point
  src/worker.ts                  core-worker entry point (event consumer)
  src/seed.ts                    idempotent seed (--force to reload)
  src/config.ts                  env vars validated with Zod
  src/modules/auth/              register, login, refresh, me, password rules
  src/modules/catalog/           categories, products (filters.ts = query builder), serializers
  src/modules/orders/            my orders; service.ts = createOrder / markOrderPaid / changeStatus
  src/modules/internal/          /internal/variants/:id, /internal/orders (for shop-service)
  src/modules/admin/             staff-only: list orders, ship, cancel
  src/events/handlers.ts         payment.succeeded -> markOrderPaid
  docker-entrypoint.sh           migrate + seed, then start

services/shop-service/
  prisma/schema.prisma           Cart, CartItem, Payment, OutboxEvent
  src/clients/coreClient.ts      timeout + retry + circuit breaker for core's internal API
  src/modules/cart/              GET/POST/PATCH/DELETE cart (service.ts has the stock rules)
  src/modules/checkout/          POST /checkout (schemas.ts = address validation)
  src/modules/payments/          GET payment, POST confirm (outbox in the same transaction)
  src/events/outbox.ts           outbox relay -> Redis stream
  src/events/listener.ts         order.shipped -> mock "shipped" e-mail
  src/notifications.ts           mock e-mails (logged)
```

**Conventions**

* A route file only parses input (`parse(schema, req.body)`), calls a function and maps the result to JSON.
  Business rules live in `service.ts` files and in pure modules like `filters.ts`, `shipping.ts` and
  `passwordRules.ts`, which are unit tested.
* Database rows (camelCase) are never returned directly. A `*Json()` serializer maps them to the
  **snake_case** API shape in `frontend/src/types/index.ts`.
* Throw `new ApiError(status, "Message.")` for any expected failure. Express 5 forwards errors from async
  handlers to the error handler automatically, so no `try/catch` is needed in routes.
* Money is an **integer in whole rupees**. Dates are ISO 8601 strings.
* URLs end with `/` for the frontend and Postman, but Express routing isn't strict, so routes are declared
  without the slash and match both forms.

---

## 4. Commands

| Where | Command | What |
|---|---|---|
| root | `npm run build` | Build shared, generate both Prisma clients, compile both services |
| root | `npm run typecheck` | Type-check everything |
| root | `npm test` | Unit tests of all packages (see 8.1 about Windows) |
| root | `npm run contract-test` | Postman collection via Newman against http://localhost |
| root | `npm run format` | Prettier |
| service | `npm run dev` | Run with hot reload (tsx), reads `../../.env.local` |
| core | `npm run dev:worker` | Run core-worker with hot reload |
| service | `npm run migrate:dev` | Create/apply a migration after editing `schema.prisma` |
| service | `npm run studio` | Prisma Studio (browse the DB in a web UI) |
| core | `npm run seed` / `npm run seed:force` | Load demo data / wipe and reload |

---

## 5. API reference

All errors have the shape `{"detail": "Readable message", "errors"?: {"field": ["..."]}}`.

### 5.1 core-service (gateway prefix `/api/core/`)

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/core/health/` | – | `{status, service:"core", database}` |
| POST | `/api/core/auth/register/` | – | 201 `{id, email, first_name, last_name}` |
| POST | `/api/core/auth/login/` | – | `{access, refresh}` |
| POST | `/api/core/auth/refresh/` | – | `{access}` |
| GET | `/api/core/auth/me/` | JWT | `{id, email, first_name, last_name}` |
| GET | `/api/core/categories/` | – | `[{id, name, slug, parent}]` |
| GET | `/api/core/products/` | – | `{count, next, previous, results}`, 8 per page |
| GET | `/api/core/products/:slug/` | – | Product with `category`, `images`, `variants` |
| GET | `/api/core/orders/` | JWT | My orders, newest first |
| GET | `/api/core/orders/:id/` | JWT | Mine only. Someone else's order → 404 |
| GET | `/api/core/admin/orders/?status=PAID` | JWT, staff | All orders |
| POST | `/api/core/admin/orders/:id/ship/` | JWT, staff | PAID → SHIPPED + publishes `order.shipped` |
| POST | `/api/core/admin/orders/:id/cancel/` | JWT, staff | PENDING → CANCELLED |
| GET | `/internal/variants/:id/` | X-Internal-Key | `{id, product_id, product_name, product_slug, size, color, color_hex, sku, price, stock, is_active}` |
| POST | `/internal/orders/` | X-Internal-Key | `{user_id, items:[{variant_id, quantity}], address}` → 201 Order |

Product list query parameters: `category` (a parent slug includes its children), `size`, `color`
(case-insensitive), `min_price`, `max_price`, `featured=true`, `search` (name and description),
`ordering` = `price | -price | name | -name | created_at | -created_at` (default `-created_at`, ties by
id), `page`.

### 5.2 shop-service (gateway prefix `/api/shop/`, all JWT except health)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/shop/health/` | – | `{status, service:"shop", database, redis}` |
| GET | `/api/shop/cart/` | – | `{items:[…], subtotal}` |
| POST | `/api/shop/cart/items/` | `{variant_id, quantity}` | cart |
| PATCH | `/api/shop/cart/items/:id/` | `{quantity}` | cart |
| DELETE | `/api/shop/cart/items/:id/` | – | cart |
| POST | `/api/shop/checkout/` | `{address:{full_name, phone, line1, city, state, postal_code}}` | 201 `{order, payment}` |
| GET | `/api/shop/payments/:id/` | – | payment |
| POST | `/api/shop/payments/:id/confirm/` | `{success: true \| false}` | payment |

### 5.3 Messages the frontend and Postman depend on (keep them exact)

| Status | Message |
|---|---|
| 400 | `Email: A user with this email already exists.` |
| 400 | `Password: This password is too short…` / `…too common.` / `…entirely numeric.` / `…too similar to the …` |
| 401 | `Invalid email or password.` |
| 401 | `Please log in to continue.` (no token) · `Session expired. Please log in again.` (expired) |
| 403 | internal API without a valid `X-Internal-Key` |
| 400 | `Only N left in stock for <Color> / <Size>.` (add to cart) · `Only N left in stock.` (update) |
| 400 | `Your cart is empty.` |
| 409 | `<Product> (<Color> / <Size>) is no longer available in that quantity. Only N left.` |
| 422 | `Phone: Enter a valid 10-digit mobile number` (checkout address) |
| 503 | `Catalog service is unavailable. Please try again shortly.` |

Business rules: shipping is **free when subtotal ≥ 1999**, otherwise **99**. Access tokens last
**30 min** and refresh tokens **7 days**. JWT claims are `user_id` (string), `token_type`, `email`,
`first_name`, `exp`, `iat`, `jti`.

---

## 6. Events (Redis Streams)

* **Stream:** `events` (`EVENTS_STREAM`). Each entry has the fields `id` (UUID), `type`, `data` (JSON).
* **Consumer groups.** Every group gets every event and acknowledges the types it doesn't handle.

| Event | Published by | Group / consumer | Effect |
|---|---|---|---|
| `payment.succeeded` `{order_id, payment_id, user_id, amount}` | shop-service (via outbox) | `core-workers` / core-worker | Order → PAID, stock reduced |
| `order.shipped` `{order_id, user_id, email, first_name}` | core-service admin "ship" | `shop-listeners` / shop-service | Mock "shipped" e-mail |

**Guarantees and how they work**
* *Not lost:* messages stay pending until `XACK`. On start, a consumer re-reads its own pending list.
  Every 30 s it runs `XAUTOCLAIM` to take over messages that another consumer read but never acknowledged.
* *Not processed twice:* core stores the event id in `processed_events` in the **same transaction** as the
  PAID update. A duplicate hits the unique constraint and is skipped.
* *Published even if Redis is down at payment time:* shop's **transactional outbox**. The relay retries every second.

**Adding a new event**
1. Add the type to `EVENT_TYPES` in `packages/shared/src/events.ts`.
2. Publish it. For anything tied to a DB change, write an outbox row in the same transaction, as in
   `payments/routes.ts`. Fire-and-forget is fine only for notifications.
3. Add a handler to the consumer's `handlers` map. Make it **idempotent**.

Debug: `docker compose exec redis redis-cli XRANGE events - +` and
`docker compose exec redis redis-cli XINFO GROUPS events`.

---

## 7. Database and migrations

Each service owns its database and its Prisma schema. **Never** query the other service's database:
call its API or react to its events.

Changing the schema:
```bash
# 1. edit services/<service>/prisma/schema.prisma
# 2. create + apply a migration (infrastructure running, .env.local present)
cd services/<service> && npm run migrate:dev -- --name add_wishlist
# 3. commit schema.prisma AND the new prisma/migrations/<timestamp>_add_wishlist folder
```
In Docker, `docker-entrypoint.sh` runs `prisma migrate deploy` on every start, so committed migrations are
applied automatically.

Notes
* Use `@map` / `@@map` so tables and columns stay snake_case.
* Anything Prisma can't express (CHECK constraints, partial indexes) goes into the migration SQL by hand.
  An example is `product_variants_stock_non_negative` in `core-service/prisma/migrations/0001_init`.
* Row locks: inside `prisma.$transaction(async tx => …)`, use
  ``tx.$queryRaw`SELECT … FOR UPDATE` `` (see `orders/service.ts`).
* The seed keeps the original ids and then moves the PostgreSQL sequences forward (`setval`).

---

## 8. Testing

### 8.1 Unit tests (Vitest)

They cover password rules, shipping, the product query builder, validation messages, JWT helpers and the
checkout address rules.

```bash
npm test
```

**Windows with Application Control / Smart App Control:** Vitest's native Rollup binary may be blocked
(`An Application Control policy has blocked this file`). Run the tests in a Linux container instead
(Git Bash):

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/src:ro" node:20-alpine sh -c '
  apk add --no-cache openssl >/dev/null && mkdir /work && cd /src &&
  tar cf - --exclude=node_modules --exclude=dist --exclude=generated --exclude=frontend . | tar xf - -C /work &&
  cd /work && npm ci --no-audit --no-fund >/dev/null 2>&1 && npm test'
```

### 8.2 Contract tests (the acceptance test)

```bash
docker compose up --build -d
npm run contract-test        # must stay 61/61
```

Run it after every change to an endpoint. The collection is shared with the frontend team and the
Python edition, so **don't edit it to make a test pass**: fix the backend instead.

### 8.3 Resilience checks (manual)

| Scenario | Steps | Expected |
|---|---|---|
| Worker down during payment | `docker compose stop core-worker`, pay, check order, `docker compose start core-worker` | PENDING while stopped, PAID within seconds after the restart |
| Core down | `docker compose stop core-service`, add to cart a few times | First calls wait ~3 s (timeout), then about 5 ms 503s (breaker open) |
| Duplicate event | `XADD` the same `payment.succeeded` id twice | Second one is logged as `duplicate`, stock reduced once |
| Admin ship | Log in as admin, `POST /api/core/admin/orders/:id/ship/` | Order SHIPPED, shop log shows `[mock email] Your order #… has shipped` |

### 8.4 Still to add

DB-backed integration tests (Vitest + supertest against a test database) for both services, mirroring
the Python suite. The plan expects ~22 core and ~11 shop tests.

---

## 9. Configuration

| Variable | Used by | Default (compose) | Notes |
|---|---|---|---|
| `JWT_SECRET` | core, shop | dev value | **Same value in both**, at least 32 characters |
| `INTERNAL_API_KEY` | core, shop | `dev-internal-key-change-me` | **Same value in both** |
| `REDIS_URL` | all | `redis://redis:6379/0` | |
| `EVENTS_STREAM` | all | `events` | |
| `CORE_DATABASE_URL` | core, worker | `postgresql://core:core@core-db:5432/core_db` | |
| `SHOP_DATABASE_URL` | shop | `postgresql://shop:shop@shop-db:5432/shop_db` | |
| `CORE_SERVICE_URL` | shop | `http://core-service:8000` | |
| `JWT_ACCESS_MINUTES` / `JWT_REFRESH_DAYS` | core | 30 / 7 | |
| `SEED_DEMO_DATA` | core | `1` | Load demo data on first start |
| `CORE_TIMEOUT_MS` | shop | 3000 | Timeout for calls to core |
| `OUTBOX_INTERVAL_MS` | shop | 1000 | Outbox relay tick |
| `LOG_LEVEL` | all | `info` | `debug` for more detail |
| `CORS_ORIGINS` | core, shop | `http://localhost,http://localhost:3000` | Only relevant when the frontend bypasses the gateway |

Each service validates its variables with Zod at startup. If one is missing or invalid, it prints the
problem and exits.

---

## 10. Logging and tracing

* Logs are JSON lines (pino). Pipe them through `npx pino-pretty` locally if you prefer.
* Nginx generates an `X-Request-ID` per request and forwards it. Each service logs it as `req.id` and
  echoes it in the response, so you can grep one id across services:
  ```bash
  docker compose logs core-service shop-service | grep <request-id>
  ```
* `/health` requests are not logged, so Docker health checks don't flood the logs.

---

## 11. Troubleshooting

| Problem | Cause / fix |
|---|---|
| `Cannot find module '@threads/shared'` or its types | Run `npm run build -w @threads/shared`. |
| `Cannot find module '../generated/client'` | Run `npm run build` (runs `prisma generate`). |
| Service exits with `Invalid environment configuration` | A variable is missing. Check `.env.local` (mode B) or `.env` / compose (mode A). |
| `P1001: Can't reach database server` | Start the infrastructure: `docker compose up -d core-db shop-db redis`. |
| Shop answers 503 for 30 s after core restarts | Circuit breaker reset time, by design. |
| Changes not visible in Docker | Rebuild: `docker compose up --build -d <service>`. |
| Order stuck PENDING | Is core-worker running? `docker compose logs core-worker` and `XINFO GROUPS events`. |
| Postman `Add more than stock` fails after many runs | Every run buys stock. Reset with `docker compose exec core-service node dist/seed.js --force`. |
