# Junior Developer Guide: Run the Store Locally with Docker (Demo)

This guide takes you from "nothing running" to a full demo of the Threads clothing store on your own
laptop. You don't need to know Node.js, PostgreSQL or Redis: Docker runs all of them for you.

**What you will do**
1. Start the application (one command)
2. Understand what runs where (the ports)
3. Give a 10-minute demo
4. Look inside the databases (no extra software needed)
5. Stop or reset everything

> Want the deeper "why"? Read [README.md](README.md) (architecture) and
> [BACKEND_DEVELOPER_GUIDE.md](BACKEND_DEVELOPER_GUIDE.md) (code) later. This guide is only about
> running and showing the app.

---

## 1. Before you start

| You need | Why | Check |
|---|---|---|
| **Docker Desktop** ([download](https://www.docker.com/products/docker-desktop/)) | Runs all 8 parts of the app | `docker --version` and `docker compose version` |
| Docker Desktop **running** (whale icon in the taskbar) | Commands fail if it's not started | `docker ps` shows a table and no error |
| ~4 GB RAM for Docker, ~3 GB disk | Images and databases | Docker Desktop → Settings → Resources |
| *(optional)* **Node.js 20+** | Only for the automatic API tests and Prisma Studio | `node --version` |

Open a terminal **in the project folder** (`ecommerce_demo_nextjs_n_node`). On Windows,
PowerShell or Git Bash both work. In VS Code, use *Terminal → New Terminal*.

---

## 2. Start the application

```bash
docker compose up --build -d
```

* `up` starts the containers, `--build` builds the images from our code, and `-d` runs them in the
  background so you get your terminal back.
* The **first time** this takes 3–6 minutes because Docker downloads and builds everything. After that
  it takes seconds.

### Is it ready?

```bash
docker compose ps
```

Wait until the **STATUS** column looks like this (run the command again every few seconds):

```
SERVICE        STATUS
core-db        Up (healthy)
shop-db        Up (healthy)
redis          Up (healthy)
core-service   Up (healthy)
core-worker    Up               <- no "healthy": it has no web port, that's normal
shop-service   Up (healthy)
frontend       Up (healthy)
nginx          Up
```

Then open **http://localhost** in your browser. You should see the store with products. 🎉

> On the first start, the backend creates the database tables and loads **demo data**:
> 17 products in 12 categories, 2 users and 2 old orders.

---

## 3. The ports: what runs where

### 3.1 How to read a port line

In [docker-compose.yml](docker-compose.yml) you'll see lines like this:

```yaml
ports: ["5433:5432"]
#        ^^^^ ^^^^
#        |    └── port INSIDE the container (where the program listens)
#        └─────── port on YOUR laptop (what you type: localhost:5433)
```

**Left = your laptop, right = inside the container.** Docker forwards one to the other.

Containers talk to **each other** using the service name and the **right-hand** port, for example
`core-db:5432` or `core-service:8000`. Your **browser or tools** use `localhost` and the **left-hand**
port.

### 3.2 Every port in our project

| Laptop port | Container | Inside port | What it is | Open it? |
|---|---|---|---|---|
| **80** | `nginx` | 80 | **The front door (API gateway).** Every browser request comes here. Nginx sends `/api/core/…` to core-service, `/api/shop/…` to shop-service, and everything else to the website. | ✅ **http://localhost**, the only URL you need for the demo |
| **8000** | `core-service` | 8000 | Backend for **users, login, products, orders**. Published so developers and Postman can call it directly. | Optional: http://localhost:8000/api/core/health/ |
| **8001** | `shop-service` | 8001 | Backend for **cart, checkout, payments**. Published for debugging. | Optional: http://localhost:8001/api/shop/health/ |
| **5433** | `core-db` | 5432 | **PostgreSQL** database of core-service (users, products, orders). | With a DB viewer (section 5) |
| **5434** | `shop-db` | 5432 | **PostgreSQL** database of shop-service (carts, payments). | With a DB viewer (section 5) |
| **6379** | `redis` | 6379 | **Redis**, the "message board" services use to send events to each other. | With `redis-cli` (section 6) |
| **8080** | `adminer` | 8080 | **Database viewer in the browser** (optional tool, off by default). | http://localhost:8080 after starting it (section 5) |
| – | `frontend` | 3000 | The Next.js website. **Not published**: you reach it through Nginx on port 80. | Use http://localhost |
| – | `core-worker` | – | Background worker that marks orders as PAID. No port: it listens for events, not web requests. | – |

**Why 5433 and 5434 and not PostgreSQL's usual 5432?**
Two reasons. Many developers already have PostgreSQL installed on 5432, and that would clash. And we
have **two** databases, so each needs its own laptop port. Inside Docker, both still use 5432.

**Why can't I open `/internal/...` at http://localhost/internal/…?**
Those endpoints are only for service-to-service calls. Nginx deliberately answers **404** there. That's
a security feature, not a bug.

### 3.3 Picture

```
 Your laptop                                    Docker
 ───────────                                    ──────────────────────────────────────────
 Browser  ── localhost:80 ───────────────────▶  nginx ──▶ frontend:3000
                                                      ├─▶ core-service:8000 ──▶ core-db:5432
                                                      └─▶ shop-service:8001 ──▶ shop-db:5432
 Postman  ── localhost:8000 / 8001 ──────────▶  (direct to the services, for testing)
 DB viewer── localhost:5433 / 5434 ──────────▶  core-db / shop-db
 Adminer  ── localhost:8080 ─────────────────▶  adminer ──▶ core-db:5432 / shop-db:5432
                                                redis:6379 ◀──▶ core-worker, both services
```

---

## 4. The 10-minute demo script

Demo accounts:

| Email | Password | Who |
|---|---|---|
| `demo@clothstore.com` | `demo1234` | A customer with 2 previous orders |
| `admin@clothstore.com` | `admin1234` | Store staff (can ship orders) |

### Part 1: Shopping (browser, http://localhost)

1. **Home page:** featured products come from the backend database.
2. **Products:** filter by category (Men / Women / Kids), size and colour, and sort by price. Search
   "linen".
3. Open a product, pick a size and colour, and click **Add to cart**. If you're not logged in, you're
   asked to log in.
4. **Log in** as `demo@clothstore.com` / `demo1234`.
5. Try adding **more than the stock** of a size. You get a friendly "Only N left in stock…" message,
   which the backend checks.
6. **Cart → Checkout:** type a wrong phone number such as `12345`. You'll see "Phone: Enter a valid
   10-digit mobile number". Then use a correct one (e.g. `9876543210`, PIN `411001`).
7. On the payment step, first click **Simulate failure**. You'll see "Payment failed (simulated). You
   can try again." and the cart is kept. Then pay successfully.
8. You're taken to the new order's page. Refresh it (or open **My orders**) and the status shows
   **PAID** after a second or two.

**What to say:** "The payment service didn't update the order itself. It published a
`payment.succeeded` **event**, and a separate background worker marked the order PAID and reduced the
stock. That's how microservices stay independent."

### Part 2: Staff ships the order (terminal)

The staff actions don't have a web page yet, so we call the API directly.

**PowerShell**
```powershell
# log in as admin and keep the token
$t = (Invoke-RestMethod -Method Post -Uri http://localhost/api/core/auth/login/ -ContentType 'application/json' -Body '{"email":"admin@clothstore.com","password":"admin1234"}').access

# list PAID orders
Invoke-RestMethod -Uri "http://localhost/api/core/admin/orders/?status=PAID" -Headers @{Authorization="Bearer $t"} | Select-Object id, status, total

# ship one (replace 1003 with an id from the list)
Invoke-RestMethod -Method Post -Uri "http://localhost/api/core/admin/orders/1003/ship/" -Headers @{Authorization="Bearer $t"} | Select-Object id, status
```

**Git Bash / macOS / Linux**
```bash
T=$(curl -s -H "Content-Type: application/json" -d '{"email":"admin@clothstore.com","password":"admin1234"}' http://localhost/api/core/auth/login/ | sed 's/.*"access":"\([^"]*\)".*/\1/')
curl -s -H "Authorization: Bearer $T" "http://localhost/api/core/admin/orders/?status=PAID"
curl -s -X POST -H "Authorization: Bearer $T" http://localhost/api/core/admin/orders/1003/ship/
```

Refresh **My orders** in the browser and the status is **SHIPPED**. Then show the "e-mail" that
shop-service sent (we only log e-mails, we don't really send them):

```bash
docker compose logs shop-service | findstr "mock email"      # PowerShell
docker compose logs shop-service | grep "mock email"         # Git Bash / macOS / Linux
```

### Part 3: "What if something breaks?" (optional, impressive)

**A. The worker is down while a customer pays**
```bash
docker compose stop core-worker
```
Buy something and pay. The payment succeeds, but the order stays **PENDING**.
```bash
docker compose start core-worker
```
Refresh **My orders**: it's **PAID** within seconds. **No event was lost**, because Redis kept it until
the worker came back.

**B. The product service is down**
```bash
docker compose stop core-service
```
Click **Add to cart**. After a few tries you instantly get *"Catalog service is unavailable. Please try
again shortly."*: a **circuit breaker** stops waiting for a service it knows is down.
```bash
docker compose start core-service
```
Wait about 30 seconds, and adding to the cart works again.

### Part 4: Automatic API tests (optional, needs Node.js)

```bash
npm run contract-test
```
This runs 31 requests and 61 checks from the [postman/](postman/) collection. Expected result:
`assertions 61, failed 0`. You can also import the two JSON files from `postman/` into the Postman
app and click **Run**.

---

## 5. Looking at the database tables

**Short answer: you don't need to install anything.** Pick one option:

| Option | Install needed? | Best for |
|---|---|---|
| **A. Adminer** (web page, runs in Docker) | ❌ No | Demos and juniors: easiest |
| **B. Prisma Studio** (comes with the project) | Only Node.js | Developers who already have Node |
| **C. `psql` in the terminal** | ❌ No | Quick SQL queries |
| **D. A desktop app** (DBeaver, pgAdmin, VS Code extension) | ✅ Yes, third-party | If you prefer a desktop tool |

### Option A: Adminer in the browser (recommended)

1. Start it. It's an optional tool, so it has its own command:
   ```bash
   docker compose --profile tools up -d
   ```
2. Open **http://localhost:8080**
3. Log in with **one** of these (Adminer runs *inside* Docker, so the server is the **service name**,
   not `localhost`):

   | Field | Core database | Shop database |
   |---|---|---|
   | System | **PostgreSQL** ⚠️ (default is MySQL, so change it!) | **PostgreSQL** |
   | Server | `core-db` | `shop-db` |
   | Username | `core` | `shop` |
   | Password | `core` | `shop` |
   | Database | `core_db` | `shop_db` |

4. Click a table on the left, then **Select data** to see its rows. Use **SQL command** to run your own
   queries.

To stop Adminer later: `docker compose stop adminer`.

### Option B: Prisma Studio (needs Node.js)

```bash
npm install                               # once, in the project root
cp .env.local.example .env.local          # once (PowerShell: copy .env.local.example .env.local)
cd services/core-service                  # or services/shop-service
npm run studio                            # opens http://localhost:5555
```

### Option C: `psql` inside the database container

```bash
docker compose exec core-db psql -U core -d core_db
```
Then type, for example:
```sql
\dt                                   -- list tables
SELECT id, email, is_staff FROM users;
SELECT id, status, total, created_at FROM orders ORDER BY id DESC LIMIT 5;
\q                                    -- quit
```
For the shop database: `docker compose exec shop-db psql -U shop -d shop_db`.

### Option D: a desktop tool (DBeaver, pgAdmin, TablePlus, VS Code "PostgreSQL" extension)

These run on your laptop (outside Docker), so use **localhost** and the **left-hand** ports:

| Setting | Core database | Shop database |
|---|---|---|
| Host | `localhost` | `localhost` |
| Port | **5433** | **5434** |
| Database | `core_db` | `shop_db` |
| User / Password | `core` / `core` | `shop` / `shop` |

> ⚠️ The most common mistake: using port **5432**. That's the port *inside* Docker. From your laptop,
> it's **5433** (core) or **5434** (shop).

### What's in the tables?

**core_db** (owned by core-service)

| Table | Contains |
|---|---|
| `users` | Customers and staff. Passwords are stored **hashed** (`password_hash`), never in plain text. |
| `categories` | Men, Women, Kids and their sub-categories (`parent_id` points to the parent) |
| `products` | Name, description, `base_price` (whole rupees), active/featured flags |
| `product_variants` | One row per size + colour, with `stock` and an optional `price_override` |
| `product_images` | Image links (empty in the demo data; the website uses local photos) |
| `orders` | One row per order: `status` (PENDING / PAID / SHIPPED / CANCELLED), totals, address |
| `order_items` | Products inside each order, **copied at purchase time** so later price changes don't alter old orders |
| `processed_events` | Ids of events the worker already handled (stops double processing) |
| `_prisma_migrations` | Which database changes have been applied (managed by Prisma; don't edit) |

**shop_db** (owned by shop-service)

| Table | Contains |
|---|---|
| `carts` | One cart per user (`user_id`) |
| `cart_items` | Products in the cart, with quantity and price |
| `payments` | One per order: PENDING / SUCCESS / FAILED |
| `outbox_events` | Events waiting to be sent to Redis. `published_at` is filled once they're sent. |
| `_prisma_migrations` | Prisma's migration history |

**Try this during the demo:** after a successful payment, look at `payments` (SUCCESS) and
`outbox_events` (a new row with `published_at` set) in **shop_db**. Then look at `orders` (PAID) and
`product_variants` (stock went down) in **core_db**. You can watch the event cross from one database to
the other.

> Each service owns its own database, so `user_id` in shop_db is just a number, not a link to the
> `users` table. That separation is on purpose: it's what makes them *micro*services.

---

## 6. Peeking at Redis events (optional)

```bash
docker compose exec redis redis-cli XRANGE events - +          # every event sent so far
docker compose exec redis redis-cli XINFO GROUPS events        # who listens, how many are pending
```
`pending` should be `0` when everything is processed.

---

## 7. Stop, restart, reset

| I want to… | Command |
|---|---|
| See what's running | `docker compose ps` |
| Watch the logs live (Ctrl+C to exit) | `docker compose logs -f core-service shop-service core-worker` |
| Stop everything (**data is kept**) | `docker compose --profile tools down` |
| Start again later | `docker compose up -d` (add `--build` if the code changed) |
| Reset demo data (products, users, orders) | `docker compose exec core-service node dist/seed.js --force` |
| **Delete everything** and start fresh | `docker compose --profile tools down -v` then `docker compose up --build -d` |

`-v` deletes the database **volumes**, which are Docker's storage for the data. Use it when you want a
totally clean demo.

---

## 8. When something goes wrong

| Problem | What to do |
|---|---|
| `error during connect` / `Cannot connect to the Docker daemon` | Docker Desktop isn't running. Start it and wait for "Engine running". |
| `port is already allocated` / `bind: address already in use` | Another program uses that port (often Skype or IIS on 80, a local PostgreSQL on 5433, another project on 8080). Close it, or change the **left** number in `docker-compose.yml`, e.g. `"8081:8080"`. |
| Browser shows **502 Bad Gateway** | The backend is still starting. Wait until `docker compose ps` shows *healthy*. |
| Store loads but shows no products | `docker compose logs core-service` and look for errors. Try `docker compose restart core-service`. |
| Order stays **PENDING** after paying | Is `core-worker` running? `docker compose ps`, then `docker compose start core-worker`. |
| "Catalog service is unavailable" | core-service is down or just restarted. Start it and wait ~30 s. |
| Login says **429** | Too many login attempts (limit: 30 per minute). Wait a minute. |
| Adminer: "Unable to connect" | Choose **PostgreSQL** as System, and use `core-db` (not `localhost`) as Server. |
| Desktop DB tool can't connect | Use `localhost` and port **5433/5434**, not 5432. |
| Everything is weird | `docker compose --profile tools down -v` and `docker compose up --build -d` gives you a clean slate. |

---

## 9. Words you'll hear

| Word | Meaning here |
|---|---|
| **Container** | One running program in its own little box (e.g. the shop-service) |
| **Image** | The recipe a container is created from (built from a `Dockerfile`) |
| **Docker Compose** | Starts many containers together, described in `docker-compose.yml` |
| **Volume** | Docker's storage that keeps database data when containers stop |
| **API gateway** | Nginx, the single front door that forwards requests to the right service |
| **Microservice** | A small, independent backend with its own database (core-service, shop-service) |
| **Event** | A message like "payment succeeded" that one service publishes and another reacts to |
| **Health check** | A small URL Docker calls to know if a service is working (`/health/`) |
| **Migration** | A script that creates or changes database tables, applied automatically on start |
| **Seed data** | The demo products, users and orders loaded on first start |
