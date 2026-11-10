# Interview Questions & Answers: Threads Cloth Store

Interview preparation based on **this project**: a Next.js storefront and a Node.js + Express microservice
backend with PostgreSQL, Prisma, Redis Streams, Nginx and Docker.

Every answer describes how *this* code works and points to the file to show if asked. Levels:
🟢 basic · 🟡 intermediate · 🔴 advanced.

**How to use it:** don't memorise the answers. Read each one, open the file it mentions, and explain it in
your own words. Section 12 (weaknesses and improvements) is the one that separates senior candidates, so
know it well.

## Contents
1. [Project overview](#1-project-overview)
2. [Architecture & microservices](#2-architecture--microservices)
3. [Node.js, Express & TypeScript](#3-nodejs-express--typescript)
4. [Authentication & security](#4-authentication--security)
5. [Database, Prisma & transactions](#5-database-prisma--transactions)
6. [Events: Redis Streams, outbox, idempotency](#6-events-redis-streams-outbox-idempotency)
7. [Resilience: timeouts, retries, circuit breaker](#7-resilience-timeouts-retries-circuit-breaker)
8. [API design & validation](#8-api-design--validation)
9. [Frontend: Next.js & React](#9-frontend-nextjs--react)
10. [Docker, Nginx & DevOps](#10-docker-nginx--devops)
11. [Testing](#11-testing)
12. [Trade-offs, weaknesses & what I would improve](#12-trade-offs-weaknesses--what-i-would-improve)
13. [Scenario & system-design questions](#13-scenario--system-design-questions)
14. [Behavioural questions (STAR) from this project](#14-behavioural-questions-star-from-this-project)
15. [Quick-fire round](#15-quick-fire-round)

---

## 1. Project overview

**Q1. 🟢 Describe the project in 60 seconds.**
> Threads is an online clothing store. The frontend is Next.js 15 with React 19 and TypeScript. The backend
> is two Node.js + Express microservices: **core-service** handles users, JWT auth, the catalog and
> orders, and **shop-service** handles the cart, checkout and payments. A **core-worker** processes events.
> Each service has its own **PostgreSQL** database accessed with **Prisma**, and they communicate
> synchronously over REST and asynchronously through **Redis Streams**. An **Nginx** API gateway is the
> single entry point. The whole system is 8 Docker containers started with one `docker compose` command,
> and a Postman contract suite of 31 requests and 61 assertions passes in full.

**Q2. 🟢 What was the hardest or most interesting part?**
> Keeping payments and orders consistent across two databases without a distributed transaction. When a
> payment succeeds, shop-service writes the payment status **and** an outbox event in one local
> transaction. A relay publishes the event to Redis, and core-worker marks the order PAID idempotently.
> That way an event can't be lost, even if Redis or the worker is down, and it can't be processed twice.

**Q3. 🟢 What is the request flow when a customer buys something?**
> 1. **Add to cart:** shop-service calls core's `GET /internal/variants/:id` for live price and stock,
>    checks quantity against stock, and saves a snapshot in the cart.
> 2. **Checkout:** shop calls `POST /internal/orders`. Core locks the variant rows, re-checks stock,
>    prices from its own DB, and creates a PENDING order. Shop creates a PENDING payment.
> 3. **Pay:** shop sets the payment to SUCCESS, empties the cart and inserts an outbox row in one
>    transaction. The relay `XADD`s `payment.succeeded`, and core-worker sets the order to PAID and
>    reduces stock.
> 4. **Ship (staff):** core sets the order to SHIPPED and publishes `order.shipped`. Shop logs a mock
>    e-mail.

**Q4. 🟢 What's your tech stack and why?**
> - **Node 20 + TypeScript (strict):** one language across front and back, with type safety.
> - **Express 5:** minimal and well known, and it forwards async errors to the error handler natively.
> - **Prisma:** type-safe queries and migrations, with one schema per service.
> - **Zod:** validation with readable errors. The frontend already used it.
> - **Redis Streams:** consumer groups and acknowledgements without running Kafka.
> - **opossum:** circuit breaker.
> - **pino:** structured JSON logs.
> - **Docker Compose:** reproducible local environment.

---

## 2. Architecture & microservices

**Q5. 🟢 What is a microservice architecture? How does this project apply it?**
> Independent services, each owning one business capability and its own data, deployable separately.
> Here core-service owns users, catalog and orders in `core-db`, and shop-service owns cart and payments in
> `shop-db`. Neither reads the other's database. They talk only through APIs and events.

**Q6. 🟡 Why "database per service"? What do you lose?**
> - **Gain:** loose coupling. Each service can change its schema, scale and deploy on its own, and one
>   service's database problem doesn't take down the other.
> - **Lose:** cross-service joins, foreign keys and ACID transactions across services. That's why
>   `user_id` and `order_id` in shop-db are plain integers, and why consistency is achieved with events,
>   the outbox and idempotency instead of one transaction.

**Q7. 🟡 When do the services use synchronous REST and when do they use events?**
> - **REST** when the caller needs an answer *now* to continue. Adding to the cart needs the live stock,
>   and checkout needs the created order and its total.
> - **Events** when something *has happened* and others react later. `payment.succeeded` leads to the
>   order being marked PAID, and `order.shipped` leads to the "shipped" e-mail. Events decouple the
>   services in time: the consumer can be down and catch up.

**Q8. 🟢 What does the API gateway do?**
> [nginx/default.conf](nginx/default.conf):
> - routes `/api/core/*` to core-service, `/api/shop/*` to shop-service and `/` to the Next.js frontend
> - **blocks `/internal/*`** with a 404
> - rate-limits login to 30 requests per minute per IP (burst 10)
> - adds an `X-Request-ID` for tracing
>
> The browser sees a single origin, so there are no CORS problems.

**Q9. 🟡 Why not split further, for example into auth, catalog and orders services?**
> We mirrored the existing Python edition (two services plus a worker) so the frontend and Postman tests
> stayed unchanged. A finer split needs a **saga** for stock reservation across catalog and orders. That
> is planned as an optional phase. More services means more network calls, deployments and failure
> modes, so you split when team or scaling needs justify it.

**Q10. 🟡 How does shop-service know who the user is without calling core-service?**
> Core signs a **JWT (HS256)** with `JWT_SECRET`. Shop has the same secret and verifies the token locally
> in `requireAuth` ([packages/shared/src/auth.ts](packages/shared/src/auth.ts)). The claims carry
> `user_id`, `email` and `first_name`. That avoids a network call per request.

**Q11. 🔴 What would you change to use asymmetric keys?**
> Sign with RS256 or ES256 using a private key held only by core, and publish the public key (e.g. a JWKS
> endpoint). Shop then verifies with the public key and **cannot mint tokens**. With HS256, any service
> that has the secret could forge tokens.

**Q12. 🟡 What is the "core-worker" and why is it a separate container?**
> Same image as core-service, different command (`node dist/worker.js`). It consumes the Redis stream as
> consumer group `core-workers`. Being separate lets you scale and restart it independently, and keeps
> slow background work off the HTTP request path.

---

## 3. Node.js, Express & TypeScript

**Q13. 🟢 How are errors handled in Express here?**
> Business code throws `new ApiError(status, "message")`. Express 5 forwards rejected promises from
> async handlers to the error middleware automatically. `errorHandler`
> ([packages/shared/src/errors.ts](packages/shared/src/errors.ts)) turns `ApiError` into
> `{"detail": "..."}`, maps JSON parse errors to 400, and logs anything unexpected as a 500
> `"Internal server error."` without leaking stack traces.

**Q14. 🟡 What changed between Express 4 and 5 that matters here?**
> Express 5 catches errors from `async` route handlers, so you don't need `express-async-errors` or
> try/catch wrappers. Path syntax is stricter, and `req.query` is a getter.

**Q15. 🟢 Explain the middleware chain in core-service.**
> In [services/core-service/src/app.ts](services/core-service/src/app.ts), in order:
> 1. `helmet` (security headers)
> 2. `cors` (allowed origins)
> 3. `express.json({limit: "100kb"})`
> 4. `pino-http` (request logging with a request id)
> 5. the routers (auth, catalog, orders and admin behind `requireAuth`; `/internal` behind
>    `requireInternalKey`)
> 6. the `notFoundHandler`
> 7. the `errorHandler`
>
> Order matters: the body parser runs before the routes, and the error handler runs last.

**Q16. 🟡 Why is `app.ts` separate from `server.ts`?**
> `createApp()` builds the app without calling `listen()`, so tests can drive it with supertest and no
> real port. `server.ts` handles listening, connections and graceful shutdown.

**Q17. 🟡 How do you implement graceful shutdown?**
> `onShutdown()` ([packages/shared/src/http.ts](packages/shared/src/http.ts)) listens for SIGTERM and
> SIGINT. It then:
> 1. closes the HTTP server (stops accepting requests, finishes in-flight ones)
> 2. stops the outbox relay after a final flush
> 3. stops the event consumer after the current message
> 4. disconnects Prisma and Redis
>
> A 10-second hard timeout prevents hanging. `docker stop` sends SIGTERM.

**Q18. 🟡 How is configuration validated?**
> Each service has a Zod schema for `process.env` (`src/config.ts`). `loadConfig()` prints every missing
> or invalid variable and calls `process.exit(1)`. Failing fast at startup is better than crashing on the
> first request. For example, `JWT_SECRET` must be at least 32 characters.

**Q19. 🟡 How is code shared between the two services?**
> npm **workspaces**: `packages/shared` is published inside the monorepo as `@threads/shared` and depends
> on `"*"`. It contains errors, validation, JWT, the internal key, logging, events and HTTP helpers. One
> root `package-lock.json` covers everything.

**Q20. 🔴 How does `req.user` get a type in TypeScript?**
> Declaration merging: `declare global { namespace Express { interface Request { user?: AuthUser } } }`
> in `auth.ts`. Routes call `currentUser(req)`, which throws a 401 if it's missing, so they get a
> non-optional user.

**Q21. 🟡 What is the Node.js event loop and where does it matter here?**
> A single thread runs JavaScript, and I/O (DB, Redis, HTTP) is non-blocking. While core waits for
> PostgreSQL, it serves other requests. CPU-heavy work blocks everyone. That's why we use bcrypt's async
> `hash` and `compare`, and why the Redis consumer uses a **dedicated connection**: `XREADGROUP BLOCK`
> holds the connection, not the thread.

---

## 4. Authentication & security

**Q22. 🟢 How does login work?**
> `POST /api/core/auth/login/`:
> 1. Zod validates the email and password.
> 2. Look up the user by lower-cased email.
> 3. `bcrypt.compare` the password.
> 4. On success, return `{access, refresh}` JWTs. On any failure, return 401 `"Invalid email or
>    password."`.
>
> Access tokens last 30 minutes and refresh tokens 7 days.

**Q23. 🟡 Why do you compare against a dummy hash when the email doesn't exist?**
> So "unknown email" and "wrong password" take the same time. Otherwise an attacker could measure
> response times to discover which emails are registered (**user enumeration**). The error message is
> also identical in both cases.

**Q24. 🟢 Access token vs refresh token?**
> The access token is short-lived (30 min) and sent with every request. The refresh token is long-lived
> (7 days) and only used at `/auth/refresh/` to get a new access token. `token_type` is in the claims, so
> a refresh token is rejected where an access token is expected. The frontend retries once after
> refreshing on a 401 ([frontend/src/lib/httpApi.ts](frontend/src/lib/httpApi.ts)).

**Q25. 🟡 How are passwords stored and validated?**
> Hashed with **bcrypt, cost 12** (`bcryptjs`, a pure JavaScript implementation, to avoid native builds
> on Alpine). The rules ([passwordRules.ts](services/core-service/src/modules/auth/passwordRules.ts)) are
> similar to Django's: at least 8 characters, not a common password, not entirely numeric, and not too
> similar to the email or name. Similarity uses a longest-common-subsequence ratio of 0.7 or more.

**Q26. 🟡 How are internal endpoints protected?**
> Two layers:
> 1. Nginx returns 404 for `/internal/*` from outside.
> 2. Core requires an `X-Internal-Key` header, compared with `crypto.timingSafeEqual` to avoid timing
>    attacks. A missing or wrong key gets a 403.

**Q27. 🟡 Why does `GET /orders/:id` return 404, not 403, for someone else's order?**
> A 403 would confirm the order exists, so attackers could probe ids (an IDOR information leak).
> Filtering by `userId` and returning 404 reveals nothing.

**Q28. 🟡 How do you prevent price manipulation?**
> The client only sends `variant_id` and `quantity`. Core computes prices from its DB at order creation
> (`createOrder`). Cart prices are a display snapshot, never trusted for payment.

**Q29. 🟡 What security headers or protections are in place?**
> - `helmet` (CSP, HSTS-ready headers, no-sniff, and so on)
> - `x-powered-by` disabled
> - CORS allow-list
> - 100 KB JSON body limit
> - Nginx login rate limit
> - parameterised SQL (Prisma and tagged-template `$queryRaw`)
> - non-root containers
> - secrets from environment variables

**Q30. 🔴 The frontend stores tokens in localStorage. Is that safe?**
> It's a trade-off, and I'd call it a weakness. Any XSS can read localStorage. The access token is also
> mirrored to a non-HttpOnly cookie so Next.js middleware can protect routes, and that middleware only
> checks the cookie *exists*, not that it's valid. The real authorisation is enforced by the backend.
> Better: store the refresh token in an **HttpOnly, Secure, SameSite** cookie set by the server, keep the
> access token in memory, and add refresh-token rotation and revocation.

**Q31. 🔴 How would you log a user out everywhere or revoke a token?**
> JWTs are stateless, so you need state. Options: short access tokens plus a refresh-token table or
> denylist keyed by `jti` (the claim is already there); a per-user `token_version` checked on refresh; or
> a Redis denylist checked by `requireAuth`. Core already re-checks `isActive` on refresh and on `/me`.

---

## 5. Database, Prisma & transactions

**Q32. 🟢 Describe the data model.**
> - **core-db:** `users`, `categories` (self-referencing parent), `products`, `product_variants`
>   (size + colour, stock, optional price override), `product_images`, `orders`, `order_items`, and
>   `processed_events`.
> - **shop-db:** `carts`, `cart_items`, `payments` and `outbox_events`.
>
> Names are snake_case through Prisma `@map` and `@@map`.

**Q33. 🟡 Why does `order_items` copy the product name, size and price?**
> It's a **snapshot** at purchase time. If the product is renamed or repriced later, old orders and
> invoices must not change. It also keeps orders readable if a product is deleted.

**Q34. 🔴 How do you stop two customers buying the last item at the same time?**
> `createOrder` runs in an interactive Prisma transaction and first executes
> `SELECT id FROM product_variants WHERE id = ANY($1) ORDER BY id FOR UPDATE`. The second transaction
> waits for the first to commit, then sees the current stock and gets a 409. `ORDER BY id` gives a
> consistent lock order, which avoids deadlocks. A `CHECK (stock >= 0)` constraint is a final guard.

**Q35. 🔴 Stock is checked at order creation but reduced at payment. Is there still an overselling window?**
> Yes, and it's worth being honest about it. Two PENDING orders can both pass the stock check for the
> last item. When both are paid, the decrement is clamped with `GREATEST(stock - qty, 0)`, so stock
> never goes negative, but we've oversold by one. Fixes:
> - **reserve** stock at checkout (decrement, or a reservations table with expiry) and release it on
>   payment failure or timeout, which is the saga in Phase 9
> - or re-check stock when marking PAID and refund or cancel if it's insufficient

**Q36. 🟡 How are migrations handled?**
> `prisma migrate dev` generates SQL migrations from `schema.prisma` in development, and they are
> committed. In Docker, `docker-entrypoint.sh` runs `prisma migrate deploy` before starting the server.
> SQL Prisma can't express, such as the CHECK constraint, is added to the migration file by hand.

**Q37. 🟡 Why does each service generate its Prisma client to `generated/client`?**
> With npm workspaces, `@prisma/client` is hoisted to the root. Both schemas would generate into the same
> `node_modules/.prisma/client` and overwrite each other. A custom `output` per service keeps them
> separate.

**Q38. 🟡 How do you avoid N+1 queries in the product list?**
> One `findMany` with `include` for category, images and variants. Prisma batches the relations into a
> few queries rather than one per product. `count` and `findMany` run together in `$transaction([...])`.

**Q39. 🟡 How does pagination work?**
> Offset pagination: 8 per page, with `skip = (page - 1) * 8` and `take = 8`. The response matches Django
> REST Framework: `{count, next, previous, results}`, where `next` and `previous` are absolute URLs built
> from the request (and the `X-Forwarded-*` headers behind Nginx). Ordering always adds `id` as a
> tie-breaker so pages are stable. An out-of-range page returns 404 `"Invalid page."`.

**Q40. 🔴 Offset vs cursor pagination?**
> Offset is simple and supports "page N", but it gets slower on deep pages and can skip or duplicate rows
> when data changes between requests. Cursor (keyset) pagination (`WHERE (created_at, id) < (...)`) is
> fast and stable, but you can't jump to page N. For an infinite-scroll catalog at scale, I'd use cursors.

**Q41. 🟡 What indexes exist and why?**
> - unique `email`, `slug` and `sku`
> - `(is_active, is_featured)` for featured listings
> - `(user_id, created_at)` for "my orders, newest first"
> - unique `(product_id, size, color)`
> - unique `(cart_id, variant_id)`
> - unique `payments.order_id`
> - `(published_at, created_at)` for the outbox relay's scan
>
> For search, `ILIKE '%term%'` can't use a B-tree index; a `pg_trgm` GIN index or full-text search would
> help.

**Q42. 🔴 You found a bug with the seed script resetting sequences. What was it?**
> `seed --force` truncated core tables with `RESTART IDENTITY`, so order ids started again at 1003. But
> shop-db (a different database) still had payments for orders 1003 to 1005, so the next checkout hit a
> unique-constraint violation on `payments.order_id`. Lesson: **ids that other services reference must
> never be reused.** The fix: no `RESTART IDENTITY`, and `setval` only ever moves a sequence forward
> (`max(MAX(id), last_value)`).

---

## 6. Events: Redis Streams, outbox, idempotency

**Q43. 🟢 Why Redis Streams instead of Redis Pub/Sub?**
> Pub/Sub is fire-and-forget: if no subscriber is connected, the message is gone. Streams **persist**
> messages, and **consumer groups** track what each group has read. A message stays *pending* until
> `XACK`. So a stopped worker catches up after restarting, and we demonstrate that live.

**Q44. 🟡 Explain consumer groups in this project.**
> There are two groups on the `events` stream. **`core-workers`** handles `payment.succeeded`.
> **`shop-listeners`** handles `order.shipped`. Every group receives every event, and each acknowledges
> the types it doesn't handle. Inside a group, each event goes to only one consumer, so you can run
> several workers for load sharing.

**Q45. 🔴 What happens if a worker crashes after reading an event but before acknowledging it?**
> The message stays in the group's Pending Entries List. On restart, the consumer first reads its own
> pending messages (`XREADGROUP … 0`). Every 30 s it also runs `XAUTOCLAIM` to take over messages that
> *any* consumer has left pending for more than 30 s, which covers a crashed consumer that never returns.
> See [packages/shared/src/events.ts](packages/shared/src/events.ts).

**Q46. 🔴 What delivery guarantee do you have, and how do you handle duplicates?**
> **At-least-once**, so duplicates are possible. The handler is **idempotent**. `markOrderPaid` inserts
> the event id into `processed_events` (unique) **in the same transaction** as the stock decrement and the
> status update. A duplicate fails the unique insert (Prisma `P2002`), which rolls everything back, and it
> is reported as `"duplicate"`. The handler also only acts if the order is still PENDING. I verified this
> by publishing the same event twice: stock dropped once.

**Q47. 🔴 What is the transactional outbox and what problem does it solve?**
> The **dual-write problem**: "update DB, then publish event" can fail between the two steps. Then the
> payment is SUCCESS but no event is sent, or the reverse. With an outbox, the payment update, the cart
> clear and an `outbox_events` row are committed in **one** DB transaction. A relay
> ([outbox.ts](services/shop-service/src/events/outbox.ts)) publishes unpublished rows every second (and
> right after a payment) and sets `published_at`. If Redis is down, it retries. If it crashes after
> publishing but before marking the row, the event is sent twice, which is safe because consumers are
> idempotent.

**Q48. 🟡 Why is the consumer group created from ID `0` and not `$`?**
> `$` means "only new messages", so events published before the group existed (e.g. before the first
> worker start) would be skipped. `0` processes the whole retained stream, and idempotency makes that
> safe.

**Q49. 🟡 Could the stream grow forever?**
> No. `XADD … MAXLEN ~ 10000` trims approximately to the last 10,000 entries (`~` lets Redis trim
> efficiently). If a pending entry is trimmed, the consumer acknowledges it when it finds no fields.
> Redis also runs with AOF persistence (`appendonly yes`) so the stream survives a restart.

**Q50. 🔴 Why does the blocking consumer need its own Redis connection?**
> `XREADGROUP BLOCK 5000` occupies the connection until a message arrives or 5 s pass. Commands on the
> same connection would queue behind it. The publisher connection also uses `enableOfflineQueue: false`
> so commands fail fast while Redis is down instead of hanging.

**Q51. 🔴 Redis Streams vs Kafka vs RabbitMQ?**
> - **Streams:** consumer groups, acknowledgements and replay in a tool we already run. A great fit at
>   this scale.
> - **Kafka:** partitioned, very high throughput, long retention, ordering per partition, and ecosystem
>   (Connect, Schema Registry). It's the step up for high volume or many consumers.
> - **RabbitMQ:** rich routing (exchanges), per-message acks and dead-letter queues. Great for task
>   queues, weaker for replaying history.

**Q52. 🔴 What's missing from the event handling for production?**
> - a **dead-letter** strategy: a message that always fails is retried forever, so use the delivery count
>   from `XPENDING` and move it after N attempts
> - schema versioning of event payloads
> - metrics: pending count and consumer lag
> - cleanup of old `outbox_events` and `processed_events` rows

---

## 7. Resilience: timeouts, retries, circuit breaker

**Q53. 🟢 What happens when core-service is down and a user adds to cart?**
> The first calls fail after the 3-second timeout with a 503: `"Catalog service is unavailable. Please
> try again shortly."` After enough failures, the **circuit breaker opens** and calls fail in a few
> milliseconds (we measured about 7 ms) without touching the network. After 30 s it goes **half-open**
> and lets one trial call through. If that succeeds, it **closes**.

**Q54. 🟡 What are the breaker settings and why?**
> In [coreClient.ts](services/shop-service/src/clients/coreClient.ts): open at **50% errors** in a
> **10 s rolling window**, with a minimum of **3 calls** (volume threshold), and stay open **30 s**.
> `errorFilter` excludes 4xx answers (404, 409, 400). Those are business answers, not outages, and
> shouldn't trip the breaker.

**Q55. 🔴 Which calls are retried and why not all of them?**
> Up to 2 retries with 200 ms and 400 ms backoff:
> - always when the request **never reached** core (`ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`)
> - after a **timeout** only if the call is safe to repeat: a GET, or a POST carrying an
>   **Idempotency-Key**
>
> A timed-out POST *without* a key is never retried: core may have created the order already, and a
> retry would create a duplicate.

**Q56. 🔴 How is checkout made safe to retry? (implemented)**
> With **Idempotency-Keys**, end to end (the pattern Stripe and Razorpay use):
> 1. **Frontend** ([lib/idempotency.ts](frontend/src/lib/idempotency.ts)): one key per cart + address
>    (kept in `sessionStorage`, so even a page refresh reuses it) and one per payment action. On a network
>    error, 502/503/504 or "still processing", it retries **with the same key** (1 s, then 2 s).
> 2. **shop-service** ([lib/idempotency.ts](services/shop-service/src/lib/idempotency.ts)) on
>    `POST /checkout` and `POST /payments/:id/confirm`. It stores `(user_id, key)` (unique) as
>    IN_PROGRESS, plus a SHA-256 of the endpoint and body.
>    - **Repeat after it finished:** the stored response is returned with `Idempotent-Replayed: true`,
>      and nothing runs again.
>    - **Repeat while it's running:** 409 with `Retry-After: 1`.
>    - **Same key with a different body:** 422.
>    - **Validation and 5xx errors** are not remembered, so the user can fix the form or retry.
>    - **Expiry:** keys expire after 24 h, and an IN_PROGRESS key abandoned for 60 s (e.g. after a
>      crash) can be taken over.
> 3. **core-service:** shop passes the key down, and `orders.idempotency_key` is UNIQUE. A repeated
>    `POST /internal/orders` returns the **same order** (200, replayed), even when two arrive at the same
>    moment (the unique index decides). The payment uses `upsert` on `order_id`.
>
> Verified: the same key 3 times gives one order; 5 parallel requests give one order; a repeated "Pay"
> gives one SUCCESS and one event.

**Q56b. 🔴 Why store the response *before* sending it?**
> If it were saved after sending, a very fast retry could arrive in between, still see IN_PROGRESS and get
> a 409. The middleware wraps `res.json`: it saves the outcome (or deletes the key) first, then sends.

**Q57. 🟡 Why have timeouts at all?**
> Without them, a hung dependency holds connections and memory until resources run out, and the failure
> spreads (cascading failure). `AbortSignal.timeout(3000)` bounds every call.

**Q58. 🟡 What do the health checks verify?**
> `GET /api/core/health/` runs `SELECT 1`. `GET /api/shop/health/` checks the DB and Redis, each with a
> 2 s timeout. They return 200 `{status: "ok"}` or 503 `"degraded"`. Docker uses them for `healthy`
> status and `depends_on: service_healthy`.

---

## 8. API design & validation

**Q59. 🟢 How is validation done and what do errors look like?**
> Zod schemas, plus `parse(schema, data, status)` from
> [validate.ts](packages/shared/src/validate.ts). The first problem becomes
> `{"detail": "<Field label>: <message>"}`, and all problems go in `errors`. For example, a bad phone at
> checkout returns 422 `"Phone: Enter a valid 10-digit mobile number"`. The frontend shows `detail`
> directly.

**Q60. 🟡 Why 400 in core but 422 for checkout?**
> To match the existing contract from the Python edition: DRF returns 400 and FastAPI returns 422. The
> frontend and Postman tests depend on these exact codes. In a greenfield API, I'd pick one convention.

**Q61. 🟡 What is contract parity, and why was it a goal?**
> The Node backend reproduces the Python backend's API exactly: URLs with trailing slashes, snake_case
> fields, integer prices, error strings and status codes. The frontend therefore needed **zero changes**,
> and the existing Postman collection became the **acceptance test** (61/61).

**Q62. 🟡 How do trailing slashes work in Express?**
> Express routing is non-strict by default, so a route defined as `/products` also matches `/products/`.
> Routes are declared without the slash and both forms work.

**Q63. 🟡 How do product filters work?**
> `buildProductQuery()` ([filters.ts](services/core-service/src/modules/catalog/filters.ts)) is a pure
> function from query string to Prisma `where` and `orderBy`:
> - **category:** matches the category slug **or** its parent's slug, so "men" includes men's T-shirts
> - **size and colour:** must match the **same** variant, with colour case-insensitive
> - **price range:** on `base_price`
> - **featured:** the featured flag
> - **search:** case-insensitive `contains` on name or description
> - **ordering:** aliases, e.g. `price` maps to `basePrice`
>
> It's pure so it can be unit tested without a database.

**Q64. 🟡 Why are prices integers?**
> Floating-point can't represent decimal money exactly (`0.1 + 0.2 !== 0.3`). Whole rupees as integers
> avoid rounding bugs. For paise or cents, store the minor unit as an integer, or use a decimal type.

**Q65. 🟢 What are the business rules for shipping?**
> Free when the subtotal is at least ₹1999, otherwise ₹99
> ([shipping.ts](services/core-service/src/modules/orders/shipping.ts)). It's calculated on the server and
> is the same constant the frontend displays.

---

## 9. Frontend: Next.js & React

**Q66. 🟢 How is the frontend structured?**
> Next.js 15 **App Router** (`src/app/*`), React 19, Tailwind 4 and TypeScript. Pages fetch data in
> **server components** where possible. Interactive parts (cart, forms, auth) are client components.
> Global state uses the **Context API**: `AuthContext`, `CartContext` and `NetworkContext`.

**Q67. 🟡 How does the same UI work with mock data and with the real backend?**
> Both clients implement one `ApiClient` interface ([frontend/src/types/index.ts](frontend/src/types/index.ts)).
> [lib/api.ts](frontend/src/lib/api.ts) exports `mockApi` or `httpApi` based on `NEXT_PUBLIC_USE_MOCK`,
> which is baked in at build time. Components only import `api`. This is the strategy/adapter pattern,
> and it let the UI be built before the backend existed.

**Q68. 🟡 How do server components reach the API inside Docker?**
> In the browser, `NEXT_PUBLIC_API_URL=http://localhost/api`. On the server (inside the container),
> `localhost` would be the frontend container itself, so it uses `API_INTERNAL_URL=http://nginx/api`.
> `httpApi` picks the base URL by checking `typeof window === "undefined"`.

**Q69. 🟡 How are protected pages handled?**
> [middleware.ts](frontend/src/middleware.ts) runs before `/checkout` and `/orders/*`. With no
> `access_token` cookie, it redirects to `/login?next=<page>`. It's a UX guard. The backend does the real
> authorisation with the JWT.

**Q70. 🟡 How does token refresh work in the frontend?**
> In `request()` ([httpApi.ts](frontend/src/lib/httpApi.ts)), a 401 response triggers one call to
> `/core/auth/refresh/`. If that succeeds, the original request is retried once. If not, the tokens are
> cleared.

**Q71. 🟡 How are forms built?**
> **react-hook-form** with **zodResolver**: the same kind of Zod schema validates on the client for
> instant feedback, and the server validates again. Server errors (`detail`) are shown in the form.

**Q72. 🔴 Explain the network-aware images.**
> `NetworkContext` detects connection quality in this order:
> 1. a `?network=` URL override (for demos)
> 2. the **Network Information API** (`effectiveType`, `downlink`, `saveData`) on Chromium
> 3. otherwise a one-off download of a 100 KB probe file, timed and cached in `sessionStorage`
>
> `ProductImage` then shows an SVG illustration on slow connections, with a "Load photo" button on the
> product page; a quality-45, narrower WebP on medium; and quality 80 on fast. The user can override
> this (Auto, Data saver or HD), and the choice is stored in `localStorage`. Detection runs after the
> `load` event so the probe doesn't compete with the page.

**Q73. 🟡 What does `next/image` give you?**
> Resizing to the `sizes` and requested width, WebP conversion, lazy loading below the fold, `priority`
> for above-the-fold images, and server-side caching (`minimumCacheTTL` of 30 days). `qualities` is
> restricted to `[30, 45, 80]` in `next.config.ts`.

**Q74. 🔴 The home page sets `revalidate = 60`, but the API client uses `cache: "no-store"`. What happens?**
> `no-store` makes that fetch dynamic, so the page is rendered per request and the 60-second ISR intent
> doesn't really apply. That's a good catch to discuss. The fix is to let catalog fetches use
> `next: { revalidate: 60 }` (public data), while keeping user-specific fetches (cart, orders) `no-store`.

**Q75. 🟢 Why `output: "standalone"`?**
> Next.js traces only the files needed at runtime into `.next/standalone`, so the production Docker image
> copies a minimal server instead of all `node_modules`. The result is a smaller image and a faster start.

---

## 10. Docker, Nginx & DevOps

**Q76. 🟢 How many containers are there and what do they do?**
> Eight:
> - `nginx`: the gateway, on port 80
> - `frontend`: Next.js
> - `core-service` (port 8000) and `core-worker`
> - `shop-service`: port 8001
> - `core-db` (5433) and `shop-db` (5434): PostgreSQL 16
> - `redis`: port 6379
>
> There is also an optional `adminer` (DB viewer, port 8080) under the `tools` profile.

**Q77. 🟡 Explain the multi-stage Dockerfile.**
> 1. **deps:** `npm ci` for the workspace, cached while the package files don't change.
> 2. **build:** compile `packages/shared` and the service, and run `prisma generate`.
> 3. **runtime:** `node:20-alpine` with only production dependencies, compiled JS, the generated client,
>    migrations and seed data. It runs as the **non-root `node` user** and has a `HEALTHCHECK`.
>
> Small image, fast rebuilds and a reduced attack surface.

**Q78. 🟡 Why is the build context the repo root?**
> The services import `packages/shared`, which is outside the service folder. A root `.dockerignore`
> keeps the context small (no `node_modules`, `dist`, frontend or docs).

**Q79. 🟡 What does "5433:5432" mean?**
> `host:container`. Your laptop's port 5433 forwards to PostgreSQL's 5432 inside the container. Containers
> talk to each other with `service-name:container-port`, e.g. `core-db:5432`. The two databases need
> different host ports, and avoiding 5432 also avoids a locally installed PostgreSQL.

**Q80. 🟡 How is startup order handled?**
> `depends_on` with `condition: service_healthy`:
> - the databases and Redis come up first
> - core-service starts and runs migrations and the seed
> - core-worker and shop-service wait for core to be healthy
> - nginx waits for both backends
>
> core-worker has its HTTP health check disabled because it has no port.

**Q81. 🔴 Why does Nginx use variables in `proxy_pass` with a `resolver`?**
> With a static `proxy_pass http://core-service:8000`, Nginx resolves the IP once at startup. If the
> container is recreated with a new IP, you get 502s. Using `set $core_upstream …` plus
> `resolver 127.0.0.11 valid=10s` (Docker's DNS) makes Nginx re-resolve every 10 s.

**Q82. 🟡 How do you trace a request across services?**
> Nginx generates `$request_id` and forwards it as `X-Request-ID`. `pino-http` uses it as the request id
> in every log line and echoes it back. Nginx hides the upstream copy (`proxy_hide_header`) so the browser
> gets one header. You grep one id across all logs.

**Q83. 🔴 How would you deploy this to production?**
> - **CI:** typecheck, unit tests, build images, run the Postman suite against a compose stack.
> - **Images:** push to a registry.
> - **Runtime:** Kubernetes (or ECS), with Deployments for each service and the worker, managed Postgres
>   (RDS) per service, and managed Redis.
> - **Secrets** from a secret manager.
> - **Migrations** as a Job before rollout.
> - **Edge:** Ingress or ALB with TLS instead of the Nginx container.
> - **Observability:** HPA autoscaling, liveness and readiness probes on `/health`, and centralised logs
>   and metrics (Prometheus, Grafana) with alerts on consumer lag and breaker state.

---

## 11. Testing

**Q84. 🟢 What is your testing strategy?**
> - **Unit (Vitest):** pure business rules such as password rules, shipping, the product query builder,
>   validation messages, JWT helpers and address validation. 20 tests.
> - **Contract (Newman + Postman):** 31 requests and 61 assertions against the running stack, covering
>   status codes, exact messages, response shapes and the async PAID event.
> - **Manual resilience checks:** stopping the worker or core-service, and sending duplicate events.

**Q85. 🟡 What is a contract test and why is it valuable here?**
> It checks the API **behaviour the consumers rely on** (shapes, codes, messages), not internal code.
> Because the same collection passed against the Python backend, passing it proves the Node rewrite is a
> drop-in replacement for the frontend.

**Q86. 🟡 How do you test code that calls another service?**
> The core client is a module (`coreClient`), so tests can replace it with `vi.mock` and simulate
> responses, 4xx answers or outages without core running. Pure functions are separated from I/O on
> purpose (`filters.ts`, `shipping.ts`, `schemas.ts`).

**Q87. 🟡 How did you run tests when Windows blocked Vitest?**
> Windows Application Control blocked Rollup's native binary. I ran the suite in a `node:20-alpine`
> container with the source mounted read-only. That's also how CI would run it, on Linux. The command is
> in the developer guide.

**Q88. 🔴 What tests are missing?**
> - DB-backed **integration tests** (Vitest + supertest against a test Postgres): concurrency on the last
>   item, own-orders-only, duplicate events and the outbox relay
> - automated resilience tests
> - E2E (Playwright: browse, login, cart, checkout, PAID)
> - load tests (k6)

---

## 12. Trade-offs, weaknesses & what I would improve

*Interviewers love "what would you do differently?" Saying it honestly shows seniority.*

**Q89. 🔴 What are the main weaknesses of the current design?**
> 1. **Overselling window:** stock is checked at checkout and reduced at payment, with no reservation
>    (Q35).
> 2. **No compensation:** if core creates the order but shop then fails to create the payment, a PENDING
>    order is left with no payment. That needs a cleanup job or saga.
> 3. **Tokens in localStorage** and a non-HttpOnly cookie (Q30). No refresh-token rotation or revocation.
> 4. **HS256 shared secret** across services (Q11).
> 5. **No dead-letter queue** for poison events (Q52).
> 6. ~~Checkout POST is not idempotent~~: **fixed** with end-to-end Idempotency-Keys (Q56). What
>    remains: keys are optional at the API level for backward compatibility, so a client that doesn't
>    send one gets no protection.
> 7. **Mock payment provider:** a real one would use webhooks with signature verification.
> 8. **Missing DB integration tests**, no metrics or alerting, no CI pipeline yet.
> 9. **Search** uses `ILIKE` and won't scale (Q41).

**Q90. 🟡 Why AdminJS was replaced with REST endpoints.**
> AdminJS was in the plan, but it's heavy and has version and ESM friction. The plan's risk section named
> staff-only REST endpoints as the fallback: list orders, ship and cancel, with `is_staff` checked on the
> server. It delivers the workflow (including the `order.shipped` event) with far less risk. A small admin
> UI can be built on top.

**Q91. 🟡 Why `bcryptjs` instead of `bcrypt`?**
> `bcrypt` is a native module, which needs build tools on Alpine and has platform-specific binaries.
> `bcryptjs` is pure JavaScript with the same algorithm and hash format. It's slower, and it runs on the
> main thread (async, but CPU work), so login under heavy load is a trade-off. With high login volume,
> use native `bcrypt` or argon2.

**Q92. 🟡 Is microservices overkill for this shop?**
> For a small shop, yes: a modular monolith would be simpler to build, test and deploy. This project is a
> reference implementation to demonstrate the patterns (database per service, events, outbox, breaker).
> In a real decision I'd start with a modular monolith and extract services when team size or scaling
> needs justify it.

---

## 13. Scenario & system-design questions

**Q93. 🔴 Black Friday: 50× traffic. What breaks first and what do you do?**
> 1. **Catalog reads** are the bulk. Cache product lists and details (CDN, or Redis with a short TTL),
>    use ISR for pages, and add read replicas.
> 2. **The login CPU** cost of bcrypt: scale core horizontally.
> 3. **Hot rows:** the last items of a popular variant get many `FOR UPDATE` waits. Use a reservation
>    system with short holds, or a queue for checkout.
> 4. **DB connections:** use PgBouncer and tune the Prisma pool.
> 5. **Workers:** run more consumers in the same group.
>
> Load test with k6 first and measure p95.

**Q94. 🔴 Add a "wishlist" feature. Where does it go?**
> Wishlists are user-specific and change often, like the cart, so they belong in **shop-service**, not in
> the catalog, which is read-heavy and owned by core. Steps:
> 1. Add a `Wishlist` model to shop's schema and run `npm run migrate:dev -- --name add_wishlist`.
> 2. Create `modules/wishlist/` (routes, service, Zod schema) behind `requireAuth`.
> 3. Snapshot the product info as the cart does.
> 4. Add unit tests and Postman requests.
>
> The gateway already routes `/api/shop/*`.

**Q95. 🔴 How would you integrate a real payment provider (Razorpay or Stripe)?**
> - Checkout creates a provider order or payment intent and returns its id to the frontend.
> - The customer pays on the provider's widget.
> - The provider calls our **webhook**. We verify the **signature**, look up the payment idempotently by
>   provider reference, then mark it SUCCESS with an outbox event in one transaction, exactly as today.
> - Never trust the browser's "payment succeeded". Only the verified webhook counts.

**Q96. 🔴 Customers complain an order shows PENDING for minutes after paying. How do you debug it?**
> 1. `docker compose ps`: is core-worker running?
> 2. `XINFO GROUPS events`: is `pending` or lag growing for `core-workers`?
> 3. shop-db `outbox_events`: are rows stuck with `published_at` null (Redis down, relay failing)?
> 4. core-worker logs: handler errors such as a DB constraint?
> 5. Follow the `X-Request-ID` or event id across logs.
>
> Then add alerts on outbox backlog and consumer lag so we find out before customers do.

**Q97. 🔴 How would you implement the checkout saga (Phase 9)?**
> Orchestrated saga:
> 1. **Reserve stock** (catalog), with a timeout.
> 2. **Create the order** (orders).
> 3. **Take payment.**
>
> On failure, run compensations in reverse: cancel the order and release the reservation. Each step is
> idempotent and driven by events or commands. Saga state is persisted, and timeouts release abandoned
> reservations.

---

## 14. Behavioural questions (STAR) from this project

*Situation · Task · Action · Result. Use real details from the project.*

**Q98. Tell me about a bug you found and fixed.**
> - **S:** After building the backend, all 61 contract checks passed, but after reloading the demo data
>   with `seed --force`, 12 checks failed.
> - **T:** Find the root cause, not just reset the environment.
> - **A:** Shop logs showed a unique-constraint error on `payments.order_id`. The reseed had restarted
>   core's order id sequence, so new orders reused ids that shop-db still referenced. I changed the seed
>   to never restart identities and to move sequences only forward. Then I rebuilt from empty volumes.
> - **R:** 61/61 on a fresh start, on repeat runs, and after reseeding. The lesson, that ids shared
>   across services must never be reused, is now documented.

**Q99. Tell me about a technical constraint you worked around.**
> - **S:** The company laptop's Windows Application Control policy blocked Vitest's native Rollup binary.
> - **T:** Still run the unit tests reliably.
> - **A:** I ran them in a throwaway `node:20-alpine` container with the source mounted read-only,
>   matching how CI on Linux would run them, and documented the command.
> - **R:** All 20 tests ran and passed, with no policy exceptions needed.

**Q100. How did you make sure the rewrite didn't break the frontend?**
> - **S:** Rewriting a Python backend in Node while the frontend stayed unchanged.
> - **T:** Guarantee identical behaviour.
> - **A:** I treated the existing Postman collection as the acceptance contract: exact URLs, fields, codes
>   and messages. I implemented to it and ran it after each change. I also checked the UI pages render
>   real data through the gateway.
> - **R:** 61/61 assertions and zero frontend code changes.

**Q101. How did you make the project easy for others to use?**
> I wrote a README (architecture plus Docker), a backend developer guide, a junior developer Docker
> guide (ports explained, a no-install database viewer through Adminer) and a demo script, and made the
> whole stack start with one command and default settings.

---

## 15. Quick-fire round

| Question | Answer |
|---|---|
| Page size? | 8 |
| Free shipping from? | ₹1999 (else ₹99) |
| Access / refresh token lifetime? | 30 min / 7 days |
| JWT algorithm? | HS256 |
| bcrypt cost? | 12 |
| Login rate limit? | 30 per minute per IP, burst 10 (Nginx) |
| Core-call timeout? | 3 s |
| Retries? | 2 (200 ms, 400 ms): if the request never reached core, or after a timeout for GET / keyed POST |
| Idempotency-Key? | Checkout + payment confirm; 24 h TTL; replay header `Idempotent-Replayed: true`; 409 while in progress; 422 if reused for another body |
| Breaker opens at? | 50% errors in 10 s, min 3 calls; open for 30 s |
| Outbox relay interval? | 1 s, 50 rows per batch, plus an immediate flush after payment |
| Stream name / groups? | `events` / `core-workers`, `shop-listeners` |
| Stream trimming? | `MAXLEN ~ 10000` |
| Stale pending reclaim? | `XAUTOCLAIM` every 30 s for messages idle more than 30 s |
| Error body shape? | `{"detail": "...", "errors"?: {...}}` |
| Wrong internal key? | 403. `/internal` at the gateway gives 404 |
| Someone else's order? | 404 |
| Out of stock at checkout? | 409 |
| Bad checkout address? | 422 |
| Core down? | 503 "Catalog service is unavailable. Please try again shortly." |
| Contract suite? | 31 requests, 61 assertions, all passing |
| Containers? | 8 (+ optional Adminer) |
| Ports? | 80 gateway, 8000 core, 8001 shop, 5433/5434 Postgres, 6379 Redis, 8080 Adminer |
