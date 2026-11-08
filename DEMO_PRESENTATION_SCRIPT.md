# Demo Presentation Script: Threads Cloth Store

A ready-to-use script for a **20–25 minute live demo**. Each step says what to **do** on screen
(🖱️) and what to **say** (🎤). Read the "Say" lines as a guide, not word for word.

| Part | Topic | Time |
|---|---|---|
| 0 | Before the audience arrives (preparation) | 15 min before |
| 1 | Opening: the problem and what we built | 2 min |
| 2 | Architecture in one picture | 3 min |
| 3 | Live demo: customer journey | 6 min |
| 4 | Behind the scenes: events and databases | 4 min |
| 5 | Staff ships the order | 2 min |
| 6 | Resilience: breaking things on purpose | 4 min |
| 7 | Quality: automatic contract tests | 1 min |
| 8 | Wrap-up, next steps, Q&A | 3 min + questions |

---

## Part 0: Preparation (15 minutes before)

### 0.1 Start and reset everything

```bash
cd ecommerce_demo_nextjs_n_node
docker compose --profile tools up --build -d     # app + Adminer database viewer
docker compose ps                                # wait until everything is "healthy"
docker compose exec core-service node dist/seed.js --force   # fresh demo data
```

### 0.2 Open these browser tabs (in this order)

| Tab | URL | Notes |
|---|---|---|
| 1 | http://localhost | Storefront, **not logged in** |
| 2 | http://localhost:8080 | Adminer: log in to **core_db** (System *PostgreSQL*, server `core-db`, user/password `core`/`core`, database `core_db`) |
| 3 | http://localhost:8080 | Second Adminer tab: log in to **shop_db** (server `shop-db`, `shop`/`shop`, `shop_db`) |
| 4 | [README.md](README.md) on GitHub, scrolled to the architecture diagram | For Part 2 |

### 0.3 Prepare two terminals

* **Terminal A (logs):** `docker compose logs -f --tail 0 shop-service core-worker`
* **Terminal B (commands, PowerShell):** paste the admin login now, so it's ready for Part 5:
  ```powershell
  $t = (Invoke-RestMethod -Method Post -Uri http://localhost/api/core/auth/login/ -ContentType 'application/json' -Body '{"email":"admin@clothstore.com","password":"admin1234"}').access
  ```

### 0.4 Final checklist

- [ ] `docker compose ps`: all services **Up**, backends **healthy**
- [ ] http://localhost shows products
- [ ] Not logged in on the storefront (log out if needed)
- [ ] Notifications muted, other apps closed, browser zoom 125% so people at the back can read
- [ ] Optional: run `npm run contract-test` once, to be sure everything passes (61/61)

> **Tip:** do one full dry run of Parts 3–6 the day before. It takes 10 minutes and removes 90% of
> demo surprises. Run `seed.js --force` afterwards to reset the data.

---

## Part 1: Opening (2 min)

🎤 **Say:**
> "Good morning, everyone. Today I'll show **Threads**, an online clothing store we built as a
> **microservices** application.
>
> Our goal wasn't just a working shop. We wanted to show how a modern e-commerce backend should behave
> when real-world problems happen: two customers buying the last item, a service crashing in the middle
> of a payment, or a slow dependency.
>
> Everything you'll see runs on this laptop with **one Docker command**: eight containers, two
> databases and a message bus. Let me first show you the big picture, then we'll use the shop like a
> customer, and finally we'll break things on purpose."

---

## Part 2: Architecture in one picture (3 min)

🖱️ **Do:** switch to Tab 4 (the README architecture diagram).

🎤 **Say:**
> "Everything starts at the browser, and the browser only ever talks to **one door**: the **Nginx API
> gateway** on port 80. The gateway routes each request:
> - website pages go to the **Next.js frontend**
> - `/api/core` goes to the **core-service**: users, login, the product catalog and orders
> - `/api/shop` goes to the **shop-service**: cart, checkout and payments
>
> Each service has **its own PostgreSQL database**. The shop service is not allowed to read the core
> database, and the other way round. That's the key rule of microservices: each team owns its data
> and can change it without breaking the others.
>
> The services talk in **two ways**:
> 1. **Directly** (synchronous REST) when an answer is needed *now*. For example, the shop asks core
>    'how many of this T-shirt are in stock?'
> 2. Through **events** on Redis Streams when something has *happened*. For example, 'payment
>    succeeded'. A background **worker** reacts to that and marks the order as paid.
>
> Login uses **JWT tokens**: core-service signs the token, and shop-service can verify it on its own,
> without calling core.
>
> Everything is Node.js with TypeScript, Express and Prisma, packaged with Docker."

---

## Part 3: Live demo, the customer journey (6 min)

### 3.1 Browse and filter

🖱️ **Do:** Tab 1, the home page. Click **Products**, filter **Men**, pick size **M**, sort by **price**
low to high. Then search **"linen"**.

🎤 **Say:**
> "The catalog comes live from the core database: 17 products, 136 size and colour variants.
> Filtering, searching, sorting and paging all happen on the server, so this works the same for 17
> products or 17,000."

### 3.2 Login is required for the cart

🖱️ **Do:** open a product (e.g. *Classic Crew Neck Tee*), choose a size and colour, click **Add to
cart**. It asks you to log in. Log in as **demo@clothstore.com / demo1234**.

🎤 **Say:**
> "Browsing is public, but the cart is personal, so the shop service asks for a valid login token.
> I'm logging in as our demo customer."

### 3.3 Stock protection

🖱️ **Do:** add the item, then try to add a quantity **larger than the stock** shown.

🎤 **Say:**
> "Notice the message: '**Only N left in stock**'. The shop service checked the *live* stock with the
> core service. The browser's number isn't trusted. The same goes for prices: at checkout the order is
> priced again from the database, so nobody can change the price in the browser."

### 3.4 Checkout with validation

🖱️ **Do:** go to **Cart → Checkout**. Enter phone **12345** and submit. Show the error. Then fix it:
phone `9876543210`, city `Pune`, PIN `411001`.

🎤 **Say:**
> "Validation messages are clear and field-specific: 'Phone: Enter a valid 10-digit mobile number'.
> The same rules are enforced on the server, not only in the form."

### 3.5 Payment: failure first, then success

🖱️ **Do:** click **Simulate failure**. Show the message. Then pay successfully. You land on the order
page. Refresh after a second: the status is **PAID**.

🎤 **Say:**
> "We use a mock payment provider. A failed payment keeps the cart, so the customer can simply try again.
> On success, the cart is emptied and the order becomes **PAID**.
>
> And here's the interesting part: **the shop service did not mark the order as paid.** It doesn't own
> orders. It published an event, and core's worker did it. Let me show you."

---

## Part 4: Behind the scenes, events and databases (4 min)

### 4.1 The logs

🖱️ **Do:** show Terminal A (the logs).

🎤 **Say:**
> "In the shop-service log we can see: *payment succeeded*, then *event published*, and our mock
> *payment received* e-mail. In the core-worker log: *payment.succeeded processed, result: paid*. Two
> services, two databases, connected only by an event."

### 4.2 The databases

🖱️ **Do:** Tab 3 (shop_db): open `payments`, then `outbox_events`. Tab 2 (core_db): open `orders`,
then `product_variants` and find the variant you bought.

🎤 **Say:**
> "In the **shop database**, the payment is SUCCESS. And here, in `outbox_events`, is the event itself,
> with a `published_at` time.
>
> This is called the **transactional outbox**. The payment and the event are saved in **one database
> transaction**. If Redis were down at that exact moment, the event wouldn't be lost. It would wait
> here and be sent a second later.
>
> In the **core database**, the order is PAID and the stock went down by exactly what we bought.
>
> One more safety net: the table `processed_events`. Message systems can deliver the same event twice,
> so the worker remembers every event it handled. A duplicate is ignored, and we never reduce stock
> twice."

---

## Part 5: Staff ships the order (2 min)

🖱️ **Do:** in Terminal B (the admin token is already prepared), list paid orders and ship the newest one:

```powershell
Invoke-RestMethod -Uri "http://localhost/api/core/admin/orders/?status=PAID" -Headers @{Authorization="Bearer $t"} | Select-Object id, status, total
Invoke-RestMethod -Method Post -Uri "http://localhost/api/core/admin/orders/<ID>/ship/" -Headers @{Authorization="Bearer $t"} | Select-Object id, status
```

Refresh the order page in Tab 1 (status **SHIPPED**). Point at Terminal A: *"[mock email] Your order
#… has shipped"*.

🎤 **Say:**
> "Store staff ship orders through a staff-only API. A normal customer token gets '403 Forbidden'.
> Shipping publishes an event in the **other direction**, from core to shop, and the shop sends the
> 'your order has shipped' e-mail. Events flow both ways, and neither service needs to know the
> other's internals."

---

## Part 6: Resilience, breaking things on purpose (4 min)

🎤 **Say:**
> "In production, things fail. Let's simulate two failures live."

### 6.1 The worker crashes during a payment

🖱️ **Do:**
```bash
docker compose stop core-worker
```
In the browser: add an item, check out, pay successfully. Open the order: it's **PENDING**.
```bash
docker compose start core-worker
```
Refresh the order: **PAID** within a few seconds.

🎤 **Say:**
> "The worker was down, so the order stayed PENDING. But the event wasn't lost. Redis Streams keep
> every message until a worker **confirms** it handled it. When the worker came back, it picked up the
> waiting event and finished the job. Customers never lose a paid order."

### 6.2 The catalog service goes down

🖱️ **Do:**
```bash
docker compose stop core-service
```
Click **Add to cart** a few times.

🎤 **Say:**
> "The first attempts wait about three seconds, our timeout. Then the **circuit breaker** opens and the
> answer is instant: 'Catalog service is unavailable. Please try again shortly.'
>
> Without a circuit breaker, every customer would wait for a timeout and threads would pile up. With it,
> we fail fast, protect the rest of the system and give a clear message."

🖱️ **Do:**
```bash
docker compose start core-service
```

🎤 **Say:**
> "After about 30 seconds, the breaker lets one trial request through. If it works, everything is back
> to normal, automatically."

---

## Part 7: Quality, automatic contract tests (1 min)

🖱️ **Do:** (optional, needs Node.js) run:
```bash
npm run contract-test
```

🎤 **Say:**
> "Finally, how do we know nothing is broken? We have a Postman collection of **31 API requests and 61
> checks**: login, catalog, cart, checkout, payment, the event that marks orders PAID, and security
> rules. It's our acceptance test: **61 out of 61 pass**. The same collection runs in Postman, so QA
> and frontend developers use exactly the same contract."

---

## Part 8: Wrap-up (3 min) and Q&A

🎤 **Say:**
> "To summarise what we've seen:
> 1. A complete shop (browse, cart, checkout, payment, orders, shipping) on **8 containers with one
>    command**.
> 2. **Microservices done properly:** each service owns its own database, and services communicate
>    through an API gateway, REST calls and events.
> 3. **Safe money and stock handling:** server-side prices, row locking for the last item, no
>    double-processing of payments.
> 4. **Resilience:** events survive crashes thanks to the outbox and Redis Streams, and a circuit
>    breaker means a dead service fails fast instead of making everyone wait.
> 5. **Quality:** 61 automated contract checks, unit tests and clear documentation for developers and
>    juniors.
>
> **Next steps** on our roadmap: an admin web panel, Swagger API documentation, database integration
> tests, and splitting the services further, with a saga pattern for stock reservation.
>
> Thank you. Happy to take questions."

---

## Q&A cheat sheet

| Likely question | Short answer |
|---|---|
| *Why microservices for a small shop?* | It's a learning and reference project. The same patterns (database per service, events, outbox, circuit breaker) are what large shops need. For a tiny shop, a monolith would be simpler, and we'd say so honestly. |
| *What happens if two people buy the last item at the same time?* | Checkout locks the product rows in the database (`SELECT … FOR UPDATE`). The second customer gets a clear "no longer available, only N left" message. |
| *Can a user change the price in the browser?* | No. Prices always come from the core database at checkout, never from the request. |
| *What if Redis is down when someone pays?* | The payment is still saved together with an outbox row. The relay retries every second and sends the event when Redis is back. |
| *Can the same payment be counted twice?* | No. Confirming a successful payment again changes nothing, and the worker skips event ids it has already processed. |
| *How do services trust each other?* | User requests carry a signed JWT. Service-to-service calls use a secret internal key, and the gateway blocks `/internal/` from outside (404). |
| *Is this production ready?* | The architecture is. For production we'd add real secrets management, HTTPS, a real payment provider, monitoring and alerts, CI/CD, and cloud deployment (e.g. Kubernetes). |
| *Why Redis Streams and not Kafka?* | Streams give us consumer groups, acknowledgements and replay with a tool we already run. Kafka is the natural upgrade for very high volume. |
| *How long did it take / how is it tested?* | Built phase by phase from a written plan. Unit tests for the business rules plus the 61-check Postman contract suite. |
| *Can I run it myself?* | Yes: clone the repo, run `docker compose up --build -d`, open http://localhost. See JUNIOR_DEVELOPER_DOCKER_GUIDE.md. |

---

## If something goes wrong during the demo

| Problem | Quick fix (say "let me show you how we recover…") |
|---|---|
| Page shows **502 Bad Gateway** | A service is still starting: `docker compose ps`, wait for *healthy*, refresh. |
| "Catalog service is unavailable" when you didn't stop anything | `docker compose start core-service`, then wait ~30 s (circuit breaker reset). |
| Order stays PENDING | `docker compose start core-worker`. This is actually a nice live example of Part 6.1! |
| Login says 429 | Too many logins in a minute (rate limit). Wait 60 s and explain it's brute-force protection. |
| Out of stock for the product you planned | Pick another size or colour, or reset: `docker compose exec core-service node dist/seed.js --force`. |
| Adminer logged out | Log in again (System **PostgreSQL**, server `core-db` / `shop-db`). |
| Everything broken | `docker compose --profile tools down -v && docker compose --profile tools up --build -d` (about 1 minute if images exist). Meanwhile, talk through the architecture diagram. |

## After the demo

```bash
docker compose --profile tools down        # stop (data kept)
# or
docker compose --profile tools down -v     # stop and delete all demo data
```
