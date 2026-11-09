# Threads – Cloth Store (Node.js microservices edition)

An online clothing store: a **Next.js** storefront in front of a **Node.js + Express
microservice backend**, with **PostgreSQL** (one database per service), **Redis Streams** as the
event bus and an **Nginx** API gateway. Everything runs locally with one Docker command.

```
docker compose up --build -d      ->  http://localhost
```

| Document | For |
|---|---|
| **README.md** (this file) | Architecture overview and running the app with Docker |
| [INTERVIEW_QUESTIONS_AND_ANSWERS.md](INTERVIEW_QUESTIONS_AND_ANSWERS.md) | 100+ interview questions with answers based on this codebase (architecture, Node, security, DB, events, frontend, Docker, trade-offs) |
| [DEMO_PRESENTATION_SCRIPT.md](DEMO_PRESENTATION_SCRIPT.md) | 20–25 minute live demo: preparation, talk track, resilience demos, Q&A cheat sheet |
| [JUNIOR_DEVELOPER_DOCKER_GUIDE.md](JUNIOR_DEVELOPER_DOCKER_GUIDE.md) | Step-by-step demo on your laptop: ports explained, demo script, viewing the database tables |
| [BACKEND_DEVELOPER_GUIDE.md](BACKEND_DEVELOPER_GUIDE.md) | Backend developers: code layout, commands, API, events, migrations, testing |
| [FRONTEND_DEVELOPER_GUIDE.md](FRONTEND_DEVELOPER_GUIDE.md), [UI_DEVELOPER_GUIDE.md](UI_DEVELOPER_GUIDE.md) | Frontend developers |
| [backend_nodejs_development_plan.txt](backend_nodejs_development_plan.txt) | The original phase-wise plan this backend follows |

---

## 1. Architecture

### 1.1 The big picture

```
                                   Browser
                                      |
                           +----------v-----------+
                           |  NGINX API GATEWAY   |  http://localhost  (:80)
                           +--+--------+-------+--+
                 /            |        |       |   /api/shop/*
          +-------v--+  +-----v--------v-+   +-v------------------+
          | Next.js  |  |  CORE-SERVICE  |<--|  SHOP-SERVICE      |
          | frontend |  |  Express :8000 |   |  Express :8001     |
          |  :3000   |  |  users, auth,  |   |  cart, checkout,   |
          +----------+  |  catalog,      |   |  payments          |
                        |  orders, admin |   |                    |
                        +---+-------+----+   +---+-----------+----+
                            |       |            |           |
                            |   +---v------------v---+       |
                            |   |   REDIS STREAMS    |       |
                            |   |  "events" stream   |       |
                            |   +---------+----------+       |
                            |             |                  |
                        +---v----+  +-----v-------+     +----v----+
                        | core-db|<-| core-worker |     | shop-db |
                        |  PG 16 |  | (consumer)  |     |  PG 16  |
                        +--------+  +-------------+     +---------+
```

### 1.2 Containers

| Container | Technology | Responsibility | Port (host) |
|---|---|---|---|
| `nginx` | Nginx 1.27 | API gateway: routing, login rate limit (30/min/IP), blocks `/internal/*` | 80 |
| `frontend` | Next.js 15 | Storefront UI (unchanged; talks to the API through the gateway) | – |
| `core-service` | Node 20, Express 5, Prisma | Users + JWT auth, catalog (filters, search, paging), orders, internal API, staff admin endpoints | 8000 |
| `core-worker` | same image as core-service | Consumes `payment.succeeded` → marks the order **PAID** and reduces stock | – |
| `shop-service` | Node 20, Express 5, Prisma | Cart, checkout, mock payments, transactional outbox; consumes `order.shipped` | 8001 |
| `core-db` | PostgreSQL 16 | Data owned by core-service only | 5433 |
| `shop-db` | PostgreSQL 16 | Data owned by shop-service only | 5434 |
| `redis` | Redis 7 (AOF on) | Event bus (Redis **Streams** + consumer groups) | 6379 |

### 1.3 How the services talk to each other

| # | Pattern | Example | Details |
|---|---|---|---|
| A | **Browser → Gateway → Service** (REST/JSON) | `GET /api/core/products/` | One origin for the browser, so no CORS issues. Nginx adds `X-Request-ID` to trace a request across services. |
| B | **Service → Service, synchronous** (REST) | shop → `GET /internal/variants/:id`, `POST /internal/orders` | Authenticated with the `X-Internal-Key` header. Uses a **3 s timeout**, **retry** (only when the request never reached core) and a **circuit breaker** (fails fast with 503 when core is down). |
| C | **Events, asynchronous** (Redis Streams) | `payment.succeeded`: shop → core-worker. `order.shipped`: core → shop | Consumer groups store each message until it is acknowledged, so a stopped worker **catches up** when it restarts. Delivery is at least once, and the handlers are idempotent. |
| D | **Identity** (JWT HS256) | `Authorization: Bearer <access>` | core-service **signs** tokens; shop-service **verifies** them locally with the same `JWT_SECRET`, so it never needs a call to core to know who the user is. |

### 1.4 Life of an order (the most important flow)

```
 Browser              shop-service                 core-service / core-db          Redis        core-worker
    | POST /cart/items      |                               |                        |               |
    |---------------------->| GET /internal/variants/:id -->| live price + stock     |               |
    |<-- cart --------------|  (snapshot saved in shop-db)  |                        |               |
    | POST /checkout        |                               |                        |               |
    |---------------------->| POST /internal/orders ------->| lock variants FOR UPDATE                |
    |                       |                               | check stock, DB prices |               |
    |                       |<-- order (PENDING) -----------| create order           |               |
    |<-- {order, payment} --| payment PENDING (shop-db)     |                        |               |
    | POST /payments/:id/confirm {success:true}             |                        |               |
    |---------------------->| ONE transaction:              |                        |               |
    |                       |  payment SUCCESS              |                        |               |
    |                       |  cart emptied                 |                        |               |
    |                       |  outbox row "payment.succeeded"                        |               |
    |<-- payment SUCCESS ---| outbox relay -- XADD -------------------------------->|               |
    |                       |                               |                        |-- XREADGROUP->|
    |                       |                               |<-- order PAID, stock reduced (idempotent)
    | GET /api/core/orders/:id  -> status PAID              |                        |               |
```

### 1.5 Design decisions worth knowing

| Decision | Why |
|---|---|
| **Database per service** | Each service owns its data and can change its schema on its own. Ids from the other service (`user_id`, `variant_id`, `order_id`) are plain integers, with no cross-database foreign keys. |
| **Prices come from core's database, never from the request** | A client can't change what it pays. Cart items keep a *snapshot* for display, but the order is priced again at checkout. |
| **`SELECT … FOR UPDATE` on variants at checkout** | Two people can't both buy the last item. |
| **Transactional outbox** (shop) | The payment status and the "payment.succeeded" event are saved in one DB transaction. If Redis is down at that moment, the relay publishes the event later, so it is never lost. |
| **Idempotent consumer** (`processed_events` table) | Streams deliver at least once. The event id is stored in the same transaction as the PAID update, so a duplicate event changes nothing. |
| **Circuit breaker** (opossum) | When core-service is down, cart and checkout calls fail in ~5 ms with `503 "Catalog service is unavailable…"` instead of every user waiting for timeouts. |
| **Same API contract as the Python edition** | The frontend and the Postman collection work **unchanged**. The Postman collection is the acceptance test: **61/61 assertions pass**. |

---

## 2. Run the application with Docker

### 2.1 Prerequisites

* **Docker Desktop** (or Docker Engine + Compose v2). Allocate about 4 GB of RAM to Docker.
* Free host ports: **80, 5433, 5434, 6379, 8000, 8001**.
* Node.js is **not** needed just to run the app.

### 2.2 Quick start

```bash
# 1. (optional) local settings: every value already has a dev default
cp .env.example .env

# 2. build and start all 8 containers (first build takes a few minutes)
docker compose up --build -d

# 3. wait until everything is healthy
docker compose ps
```

On first start, core-service applies the database migrations and loads the **demo data**: 12 categories,
17 products, 136 variants, 2 users and 2 past orders. shop-service applies its own migrations.

### 2.3 Open it

| What | URL |
|---|---|
| Storefront | http://localhost |
| Core API health | http://localhost/api/core/health/ |
| Shop API health | http://localhost/api/shop/health/ |
| Products API | http://localhost/api/core/products/?category=men&ordering=price |

**Demo accounts**

| Email | Password | Role |
|---|---|---|
| `demo@clothstore.com` | `demo1234` | customer (has 2 past orders) |
| `admin@clothstore.com` | `admin1234` | staff (can ship / cancel orders via `/api/core/admin/…`) |

### 2.4 Check that everything works (contract tests)

With the stack running and Node.js installed:

```bash
npm run contract-test
# same as: npx newman run postman/Threads-Backend.postman_collection.json \
#            -e postman/Threads-Local.postman_environment.json
```

Expected: `requests 31 / failed 0`, `assertions 61 / failed 0`. You can also import both files from
[postman/](postman/) into the Postman app and use the Collection Runner.

### 2.5 Everyday commands

| Task | Command |
|---|---|
| Start / rebuild after code changes | `docker compose up --build -d` |
| Rebuild just one service | `docker compose up --build -d shop-service` |
| Status and health | `docker compose ps` |
| Follow logs | `docker compose logs -f core-service core-worker shop-service` |
| Stop (keep data) | `docker compose down` |
| Stop and **delete all data** | `docker compose down -v` |
| Reload demo data from scratch | `docker compose exec core-service node dist/seed.js --force` |
| Open a SQL shell | `docker compose exec core-db psql -U core -d core_db` (or `shop-db … -U shop -d shop_db`) |
| Browse the databases in a web UI (Adminer) | `docker compose --profile tools up -d` → http://localhost:8080 (System *PostgreSQL*, server `core-db`, user/password `core`/`core`, database `core_db`; or `shop-db`, `shop`/`shop`, `shop_db`) |
| Look at the event stream | `docker compose exec redis redis-cli XRANGE events - +` |

### 2.6 Try the event-driven parts yourself

```bash
# Worker down -> payment still succeeds, order stays PENDING ...
docker compose stop core-worker
#   (pay for an order in the UI)
docker compose start core-worker      # ... and becomes PAID as soon as the worker is back

# core-service down -> the circuit breaker answers instantly with 503
docker compose stop core-service      # add to cart in the UI -> "Catalog service is unavailable…"
docker compose start core-service     # the breaker closes again after about 30 s
```

### 2.7 Frontend in mock mode

To make the UI use only the JSON mock data, set `NEXT_PUBLIC_USE_MOCK=true` in `.env` and rebuild the
frontend: `docker compose up --build -d frontend`. The value is baked in at build time. To develop the UI
without Docker at all, see [FRONTEND_DEVELOPER_GUIDE.md](FRONTEND_DEVELOPER_GUIDE.md).

### 2.8 Troubleshooting

| Symptom | Fix |
|---|---|
| `port is already allocated` | Another program uses 80/5433/5434/6379/8000/8001. Stop it, or change the left-hand port in `docker-compose.yml`. |
| `502 Bad Gateway` right after start | A service is still starting. Wait for `docker compose ps` to show *healthy*. |
| Shop calls return 503 for ~30 s after core-service restarts | Expected: the circuit breaker waits 30 s before it tries core again. |
| Order stays `PENDING` after a successful payment | Check `docker compose logs core-worker`. It catches up automatically once running. |
| Login returns `429` | Nginx rate limit (30 logins per minute per IP). Wait a minute. |
| Changed `JWT_SECRET` and now get 401 | Log out and log in again: old tokens were signed with the old secret. |
| Start completely fresh | `docker compose down -v && docker compose up --build -d` |

---

## 3. Repository layout

```
.
├── docker-compose.yml          all 8 containers
├── .env.example                settings (copy to .env)
├── nginx/default.conf          API gateway
├── postman/                    contract tests (collection + environment)
├── frontend/                   Next.js storefront
├── package.json                npm workspaces: packages/*, services/*
├── packages/shared/            code used by both services (errors, validation, JWT, logging, events)
└── services/
    ├── core-service/           users, auth, catalog, orders, internal API, admin, core-worker
    └── shop-service/           cart, checkout, payments, outbox, order.shipped listener
```

Details for each folder are in [BACKEND_DEVELOPER_GUIDE.md](BACKEND_DEVELOPER_GUIDE.md).

## 4. Status against the plan

| Phase | Status |
|---|---|
| 0 Workspace, shared package | ✅ |
| 1 Auth (register, login, refresh, me, password rules) | ✅ |
| 2 Catalog + seed (filters, search, ordering, paging) | ✅ |
| 3 Orders, internal API, row locking, admin | ✅. Admin is the plan's documented fallback (staff-only REST endpoints) instead of AdminJS |
| 4 Cart, checkout, payments, circuit breaker | ✅ |
| 5 Redis Streams, outbox, core-worker, order.shipped listener | ✅ |
| 6 Docker, gateway, frontend integration | ✅ |
| 7 Contract tests | ✅ 61/61 Postman assertions; resilience checks verified manually |
| Not done yet | Swagger docs (`/api/shop/docs`), AdminJS UI, DB-backed integration tests (Vitest + supertest), ESLint, Phase 9 (finer-grained services + saga) |
