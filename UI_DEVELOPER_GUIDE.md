# UI Developer Guide: How the Threads Storefront Works

This guide explains **how the frontend is built**: the technologies, the
architecture, how routing works, how a component ends up on the screen, and how
data moves through the UI.

For **how to run it** (Docker, demo login, troubleshooting), see
`FRONTEND_DEVELOPER_GUIDE.md`.

---

## Contents

1. [Technology stack](#1-technology-stack)
2. [UI architecture at a glance](#2-ui-architecture-at-a-glance)
3. [Folder structure and responsibilities](#3-folder-structure-and-responsibilities)
4. [Routing (Next.js App Router)](#4-routing-nextjs-app-router)
5. [How a page renders on screen](#5-how-a-page-renders-on-screen)
6. [Server components vs client components](#6-server-components-vs-client-components)
7. [Data flow](#7-data-flow)
8. [State management: where each piece of state lives](#8-state-management-where-each-piece-of-state-lives)
9. [Walkthroughs of real user flows](#9-walkthroughs-of-real-user-flows)
10. [Styling](#10-styling)
11. [How to add a new page (step by step)](#11-how-to-add-a-new-page-step-by-step)
12. [Glossary](#12-glossary)

---

## 1. Technology stack

| Technology | Version | What it does in this project |
| --- | --- | --- |
| **Next.js** | 15.5 | The React framework. Gives us file-based routing (App Router), server rendering (SSR/SSG/ISR), middleware, and the production server. |
| **React** | 19 | The UI library. Everything on screen is a React component. |
| **TypeScript** | 5.9 | Adds types to JavaScript. `src/types/index.ts` defines the shape of every object (Product, Cart, Order…). |
| **Tailwind CSS** | 4 | Utility-first CSS. Classes like `rounded-lg p-4 text-sm` style elements directly in JSX. |
| **React Hook Form** | 7 | Manages form inputs, submit, and error state with very few re-renders. |
| **Zod** | 3 | Schema validation. Defines rules like "PIN code must be 6 digits". Connected to React Hook Form through `@hookform/resolvers`. |
| **Context API** | built into React | Global state for the logged-in user and the cart. |
| **localStorage + cookies** | browser | Store tokens, and in mock mode, the cart/orders/registered users. |
| **JSON mock files** | — | Fake backend data in `src/mocks/`. |
| **Docker** | — | Multi-stage `Dockerfile` builds a small production image; `docker-compose.yml` runs it. |
| **Node.js** | 20 (alpine) | Runs the Next.js server inside the container. |

No extra state library (Redux, Zustand) or data-fetching library (React Query)
is used. Plain React and Next.js features are enough for this app, which keeps
the concepts easy to see.

---

## 2. UI architecture at a glance

The UI is organised in **layers**. Each layer only talks to the layer directly
below it.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. ROUTING LAYER           src/middleware.ts, src/app/**                 │
│    Decides WHICH page to show for a URL, and who is allowed to see it.   │
├──────────────────────────────────────────────────────────────────────────┤
│ 2. PAGE LAYER              src/app/**/page.tsx                           │
│    One file per screen. Fetches the data that screen needs and lays out  │
│    components.                                                           │
├──────────────────────────────────────────────────────────────────────────┤
│ 3. COMPONENT LAYER         src/components/*.tsx                          │
│    Reusable UI pieces: Navbar, ProductCard, ProductFilters, AddToCart…   │
├──────────────────────────────────────────────────────────────────────────┤
│ 4. STATE LAYER             src/context/*.tsx                             │
│    Global client state shared by many components: AuthContext,          │
│    CartContext.                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ 5. DATA ACCESS LAYER       src/lib/api.ts                                │
│    The ONE place the UI asks for data. Picks an implementation:          │
│         ┌───────────────────────┐        ┌──────────────────────────┐    │
│         │ mockApi.ts (today)    │   OR   │ httpApi.ts (later)       │    │
│         │ JSON + localStorage   │        │ fetch → Nginx → Django / │    │
│         │                       │        │ FastAPI                  │    │
│         └───────────────────────┘        └──────────────────────────┘    │
├──────────────────────────────────────────────────────────────────────────┤
│ 6. CONTRACT                src/types/index.ts                            │
│    TypeScript types + the ApiClient interface both implementations obey. │
└──────────────────────────────────────────────────────────────────────────┘
```

**Why layers?** Pages and components never call `fetch` or read JSON files
directly. They call `api.getProducts()`. That one decision is what lets us swap
mock data for the real microservices later by changing a single environment
variable (`NEXT_PUBLIC_USE_MOCK`), without touching any page.

---

## 3. Folder structure and responsibilities

```
frontend/src/
├── middleware.ts            Runs BEFORE a page; protects /checkout and /orders
│
├── app/                     ROUTES: folder path = URL path
│   ├── layout.tsx           Root layout: <html>, Navbar, Footer, Providers
│   ├── globals.css          Tailwind import + shared CSS classes
│   ├── icon.svg             Browser tab icon (served at /icon.svg)
│   ├── page.tsx             "/"                 Home
│   ├── loading.tsx          Skeleton shown while a server page loads
│   ├── error.tsx            Shown when a page throws an error
│   ├── not-found.tsx        Shown for unknown URLs and notFound()
│   ├── products/
│   │   ├── page.tsx         "/products"         Product list
│   │   └── [slug]/page.tsx  "/products/:slug"   Product detail
│   ├── cart/page.tsx        "/cart"
│   ├── checkout/page.tsx    "/checkout"         (protected)
│   ├── login/page.tsx       "/login"
│   ├── register/page.tsx    "/register"
│   └── orders/
│       ├── page.tsx         "/orders"           (protected)
│       └── [id]/page.tsx    "/orders/:id"       (protected)
│
├── components/              REUSABLE UI
│   ├── Navbar.tsx           Logo, category links, search, login/logout, cart badge
│   ├── Footer.tsx
│   ├── ProductCard.tsx      One product tile in a grid
│   ├── ProductImage.tsx     Coloured garment placeholder image (SVG)
│   ├── ProductFilters.tsx   Sort / category / size / colour / price filters
│   ├── Pagination.tsx       Page number links
│   ├── AddToCart.tsx        Colour + size + quantity picker on product page
│   └── OrderStatusBadge.tsx Coloured PENDING / PAID / SHIPPED pill
│
├── context/                 GLOBAL CLIENT STATE
│   ├── AuthContext.tsx      user, login(), register(), logout()  → useAuth()
│   ├── CartContext.tsx      cart, count, add(), update(), remove() → useCart()
│   └── Providers.tsx        Wraps the app in both providers
│
├── lib/                     LOGIC, NO UI
│   ├── api.ts               Chooses mockApi or httpApi → exports `api`
│   ├── mockApi.ts           Fake backend
│   ├── httpApi.ts           Real backend client (JWT, token refresh)
│   ├── config.ts            Env variables, page size, shipping rules
│   ├── format.ts            Price/date formatting, small product helpers
│   └── storage.ts           Token + localStorage + cookie helpers
│
├── mocks/                   JSON TEST DATA
│   ├── categories.json  products.json  users.json  orders.json
│
└── types/index.ts           DATA SHAPES + ApiClient interface
```

---

## 4. Routing (Next.js App Router)

### 4.1 The core rule: folders become URLs

Next.js looks inside `src/app/`. **Every folder that contains a `page.tsx` is a
URL.** There is no router configuration file. The file system *is* the router.

| URL in browser | File that renders | Type |
| --- | --- | --- |
| `/` | `app/page.tsx` | Static + ISR (refreshed every 60 s) |
| `/products` | `app/products/page.tsx` | Dynamic (server-rendered per request) |
| `/products?category=men&size=M` | `app/products/page.tsx` (same file, reads the query) | Dynamic |
| `/products/floral-wrap-dress` | `app/products/[slug]/page.tsx` | Dynamic |
| `/cart` | `app/cart/page.tsx` | Static shell, data loaded in browser |
| `/checkout` | `app/checkout/page.tsx` | Static shell, protected |
| `/login`, `/register` | `app/login/page.tsx`, `app/register/page.tsx` | Static shell |
| `/orders` | `app/orders/page.tsx` | Static shell, protected |
| `/orders/1003` | `app/orders/[id]/page.tsx` | Dynamic, protected |
| `/anything-else` | `app/not-found.tsx` | 404 |

You can see this classification in the `npm run build` output (`○ Static`,
`ƒ Dynamic`).

### 4.2 Dynamic segments: `[slug]` and `[id]`

A folder name in square brackets is a **placeholder**. Whatever is in that
part of the URL is passed to the page as `params`.

```
URL:     /products/floral-wrap-dress
Folder:  app/products/[slug]/page.tsx
params:  { slug: "floral-wrap-dress" }
```

In a **server** page (`products/[slug]/page.tsx`), Next.js 15 passes `params` as
a Promise:

```tsx
export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await api.getProduct(slug);
  if (!product) notFound();          // → shows app/not-found.tsx
  ...
}
```

In a **client** page (`orders/[id]/page.tsx`), we read it with a hook:

```tsx
const { id } = useParams<{ id: string }>();   // "/orders/1003" → id = "1003"
```

### 4.3 Query strings: `?category=men&page=2`

The `?…` part does not change which file renders. It is passed as
`searchParams`. The products page uses it as the **single source of truth for
filters, sorting and pagination**:

```tsx
// app/products/page.tsx (server component)
export default async function ProductsPage({ searchParams }) {
  const params = await searchParams;          // { category: "men", page: "2" }
  const data = await api.getProducts(query);  // filtered on the server
  ...
}
```

Because the filters live in the URL, you can bookmark, share, refresh, or press
Back and you get the same results.

### 4.4 Special files

Next.js gives some file names special meaning. They apply to their folder **and
everything below it**:

| File | When it is used | In our app |
| --- | --- | --- |
| `layout.tsx` | Wraps every page under it. Stays mounted while you navigate between pages, so Navbar state is not lost. | `app/layout.tsx` (root) |
| `page.tsx` | The actual content for a URL. | one per route |
| `loading.tsx` | Shown instantly while a server page is still fetching data (uses React Suspense). | `app/loading.tsx` (skeleton grid) |
| `error.tsx` | Shown if a page throws an error. Has a "Try again" button that calls `reset()`. | `app/error.tsx` |
| `not-found.tsx` | Unknown URLs, or when code calls `notFound()`. | `app/not-found.tsx` |
| `icon.svg` | Becomes the browser tab icon. | `app/icon.svg` |

The nesting Next.js builds for every page:

```
<RootLayout>                      app/layout.tsx
  <ErrorBoundary fallback={error.tsx}>
    <Suspense fallback={loading.tsx}>
      <Page />                    app/…/page.tsx
    </Suspense>
  </ErrorBoundary>
</RootLayout>
```

> `error.tsx` catches errors from **pages**, not from `layout.tsx` itself.
> Catching layout errors would need an extra `app/global-error.tsx`.

### 4.5 How navigation happens

| Method | Where we use it | What happens |
| --- | --- | --- |
| `<Link href="…">` | ProductCard, Navbar, Pagination, breadcrumbs | **Client-side navigation**: no full page reload. Next.js fetches only the new page's content, and the layout (Navbar, cart badge) stays as it is. Links visible on screen are prefetched in production, so clicks feel instant. |
| `router.push("…")` | Navbar search, ProductFilters, after login, after payment | Same as Link but triggered from code (e.g. after a form submit). |
| `router.refresh()` | After login/register | Re-runs server components for the current page so they see the new state. |
| `notFound()` | Product detail when slug doesn't exist | Stops rendering and shows `not-found.tsx`. |
| `NextResponse.redirect()` | `middleware.ts` | Server-side redirect before the page is rendered. |

### 4.6 Protected routes (middleware)

`src/middleware.ts` runs on the server **before** any matching page renders:

```ts
export const config = { matcher: ["/checkout", "/orders/:path*"] };
```

```
Browser requests /checkout
        │
        ▼
middleware.ts: is there an "access_token" cookie?
        │
   ┌────┴─────┐
  NO          YES
   │           │
   ▼           ▼
307 redirect   continue → render checkout/page.tsx
to /login?next=/checkout
```

After a successful login, the login page reads `?next=/checkout` and sends the
user back to where they were going.

Why a **cookie** and not just localStorage? Middleware runs on the server, and
the server cannot read the browser's localStorage. Cookies are sent with every
request, so `storage.ts` copies the access token into a cookie on login.

---

## 5. How a page renders on screen

### 5.1 The full journey of a first visit

Here is what happens when you type `http://localhost:3000/products?category=men`
and press Enter:

```
 BROWSER                                   NEXT.JS SERVER (Docker container)
 ───────                                   ─────────────────────────────────
 1. GET /products?category=men ─────────►
                                           2. middleware.ts
                                              (route not protected → continue)
                                           3. Match route → app/products/page.tsx
                                           4. Run SERVER components:
                                              • RootLayout: api.getCategories()
                                                → passes categories to Navbar
                                              • ProductsPage: api.getProducts({category:"men"})
                                           5. Render the whole tree to HTML.
                                              Client components (Navbar,
                                              ProductFilters…) are ALSO rendered
                                              to HTML here using their initial state.
                                           6. Stream response:
                       ◄─────────────────     • HTML (what you see immediately)
                                              • RSC payload (description of the
                                                server component output)
                                              • JS bundles for client components
 7. Browser PAINTS the HTML.
    You can already see products.
    (Buttons don't respond yet.)
 8. JavaScript loads → React HYDRATES:
    attaches event handlers to the
    existing HTML for client components.
    Now the page is interactive.
 9. useEffect hooks run (browser only):
    • AuthProvider: token in localStorage?
      → api.me() → shows "Hi, Demo"
    • CartProvider: api.getCart()
      → cart badge shows the item count
10. Page is fully ready.
```

**Key idea:** the server sends finished HTML, so the user sees content fast and
search engines can read it. The browser then "wakes up" the interactive parts
(hydration). Things that only the browser knows (the logged-in user, the cart in
localStorage) load just after.

### 5.2 Later navigations (client-side)

When you then click a product card (`<Link>`):

```
1. No full reload. The browser asks the server only for the RSC payload
   of /products/[slug].
2. While waiting, loading.tsx (skeleton) is shown in the page area.
3. Server runs ProductDetailPage → api.getProduct(slug) → returns payload.
4. React swaps the page content. RootLayout, Navbar, Footer, AuthContext
   and CartContext stay mounted. The cart badge and login state are NOT
   reloaded.
```

### 5.3 The component tree on screen

This is the actual tree React builds for the product detail page:

```
<html>                                         app/layout.tsx        (server)
 └─ <body>
     └─ <Providers>                            context/Providers     (client)
         └─ <AuthProvider>                     user state
             └─ <CartProvider>                 cart state
                 ├─ <Navbar categories=[…]>    components/Navbar     (client)
                 │    uses useAuth(), useCart()
                 ├─ <main>
                 │   └─ <ProductDetailPage>    products/[slug]/page  (server)
                 │       ├─ breadcrumb <Link>s
                 │       ├─ <AddToCart product={…}>                  (client)
                 │       │    ├─ <ProductImage color=…>             (shared)
                 │       │    ├─ colour buttons, size buttons, qty
                 │       │    └─ uses useCart().add()
                 │       └─ "You may also like"
                 │           └─ <ProductCard> × 4                    (shared)
                 │                └─ <ProductImage>
                 └─ <Footer>                   components/Footer     (server-safe)
```

Notice that a **server** component (`ProductDetailPage`) can render a **client**
component (`AddToCart`) and pass it data as props. This pattern is called
"client islands": most of the page is static HTML, and only the interactive
parts ship JavaScript.

### 5.4 What triggers a re-render

Once on screen, a client component re-renders when:

| Trigger | Example in our code |
| --- | --- |
| Its own state changes (`useState` setter) | Clicking a size button calls `setSize("M")` in `AddToCart` |
| A context it uses changes | `add()` updates CartContext → **Navbar badge** re-renders automatically |
| Its parent passes new props | Products page re-renders `ProductCard`s with new data after a filter change |
| Its `key` changes (full reset) | `<ProductFilters key={JSON.stringify(query)}>` resets the price inputs when the URL changes |

Server components don't re-render in the browser. They re-run on the server when
you navigate to their URL or call `router.refresh()`.

---

## 6. Server components vs client components

In the App Router, **every component is a server component by default**. Adding
`"use client"` at the top of a file makes it (and everything it imports) a
client component.

| | Server component | Client component (`"use client"`) |
| --- | --- | --- |
| Runs where | Only on the server | Server (first HTML) **and** browser |
| Can be `async` / `await` data | ✅ | ❌ |
| Can use `useState`, `useEffect`, `onClick` | ❌ | ✅ |
| Can read localStorage / `window` | ❌ | ✅ (inside effects/handlers) |
| JavaScript sent to browser | None | Yes |

**Our split and the reason for each:**

| File | Kind | Why |
| --- | --- | --- |
| `app/layout.tsx` | Server | Fetches categories once on the server |
| `app/page.tsx` (Home) | Server | Static content + product lists, good for SEO and speed |
| `app/products/page.tsx` | Server | Filtering happens on the server using `searchParams` |
| `app/products/[slug]/page.tsx` | Server | Product data + page `<title>` via `generateMetadata` |
| `components/ProductCard.tsx`, `Pagination.tsx`, `Footer.tsx` | Server-safe | Pure display: props in, HTML out, no state |
| `components/Navbar.tsx` | Client | Needs auth/cart context, search input, mobile menu toggle |
| `components/ProductFilters.tsx` | Client | Handles clicks and `router.push` |
| `components/AddToCart.tsx` | Client | Selected colour/size/quantity state, button clicks |
| `context/*.tsx` | Client | React Context and `useState` only exist in the browser |
| `app/cart`, `checkout`, `login`, `register`, `orders/**` | Client | Depend on per-user data stored in the browser (cart, token) |

**Rule of thumb used in this project:** keep pages as server components when the
data is public and the same for everyone. Use client components for anything
the user interacts with, or anything personal to the user.

---

## 7. Data flow

### 7.1 One-way data flow

React data flows **down** through props, and events flow **up** through callbacks
or context functions.

```
                 data (props) flows DOWN
     ProductsPage ──────────────► ProductCard ──────► ProductImage
          ▲                     product={p}          color={hex}
          │
          │ URL change (router.push) flows UP and re-runs the page
          │
     ProductFilters  (user clicks "Size M")
```

### 7.2 The data access path

Every piece of data comes through the same path:

```
 Component / Page / Context
          │  api.getProducts(query)
          ▼
 src/lib/api.ts
   export const api = USE_MOCK ? mockApi : httpApi
          │                                │
          ▼ (NEXT_PUBLIC_USE_MOCK=true)   ▼ (=false, later)
 src/lib/mockApi.ts                   src/lib/httpApi.ts
   • reads src/mocks/*.json             • fetch(`${API_URL}/core/products/?…`)
   • reads/writes localStorage            with "Authorization: Bearer <token>"
   • fake delay 150–700 ms              • on 401: refresh token, retry once
   • throws ApiError(status, msg)       • throws ApiError(status, msg)
          │                                │
          ▼                                ▼
   Returns data shaped exactly like src/types/index.ts
   e.g. Paginated<Product> = { count, next, previous, results }
```

Both implementations follow the same `ApiClient` interface defined in
`src/types/index.ts`. TypeScript refuses to compile if either one returns the
wrong shape.

### 7.3 Two ways pages get data

**A) Server-side fetching** (public data: categories, products)

```tsx
// Server component: just await it. No useState, no useEffect, no loading flag.
const data = await api.getProducts(query);
return <>{data.results.map(p => <ProductCard key={p.id} product={p} />)}</>;
```

The loading state is handled automatically by `loading.tsx`.

**B) Client-side fetching** (personal data: orders, cart, user)

```tsx
// Client component: fetch after mount, track loading/error yourself.
const [orders, setOrders] = useState<Order[] | null>(null);   // null = loading
const [error, setError]   = useState<string | null>(null);

useEffect(() => {
  api.getOrders().then(setOrders).catch(e => setError(errorMessage(e)));
}, []);

if (error)   return <ErrorBox />;
if (!orders) return <p>Loading orders…</p>;
return <OrderList orders={orders} />;
```

This must run in the browser because it needs the token from localStorage.

### 7.4 Global state flow (Context)

Some data is needed by components that are far apart in the tree. For example,
the cart count in the Navbar changes when you click "Add to cart" on the product
page. Passing props through every level would be painful, so we use **Context**:

```
                ┌──────────────── CartProvider ────────────────┐
                │ state: cart = { items: [...], subtotal }     │
                │ actions: add(), update(), remove(), refresh()│
                └───────▲──────────────────┬───────────────────┘
          add(variantId, qty)              │ new cart value
                        │                  │ (every consumer re-renders)
          ┌─────────────┴───┐     ┌────────┴───────┬──────────────┐
          │ AddToCart       │     │ Navbar         │ Cart page    │
          │ (product page)  │     │ badge: count   │ item list    │
          └─────────────────┘     └────────────────┴──────────────┘
```

Components use it with a **custom hook**:

```tsx
const { count } = useCart();     // Navbar
const { add }   = useCart();     // AddToCart
const { user, login, logout } = useAuth();
```

The hooks throw a clear error if a component is used outside `<Providers>`,
which catches setup mistakes early.

### 7.5 Error flow

```
mockApi / httpApi  ──throw ApiError(400, "Only 2 left in stock…")──►
   CartContext.add()  (doesn't catch; re-throws to caller)        ──►
      AddToCart.onAdd()  try { … } catch (e) { setStatus({type:"error", text: errorMessage(e)}) }
         ──► red message shown under the button
```

Rule: the **component that started the action** decides how to show the error.
Errors thrown while a server page renders are caught by `app/error.tsx`.

---

## 8. State management: where each piece of state lives

Choosing **where** state lives is the most important design decision in a React
app. Here is every kind of state in this project:

| Kind of state | Where it lives | Examples | Why there |
| --- | --- | --- | --- |
| **URL state** | Query string / path | category, size, colour, price, sort, page, search, product slug, order id | Shareable, bookmarkable, survives refresh, works with Back button |
| **Server data** | Fetched in server components | product list, product detail, categories | Same for everyone, renders fast, good for SEO |
| **Global client state** | React Context | logged-in `user`, `cart` | Needed by many distant components |
| **Local UI state** | `useState` in one component | selected colour/size/qty, mobile menu open, "Adding…" spinner, error messages, checkout step | Only one component cares |
| **Form state** | React Hook Form | login/register/checkout inputs and their validation errors | Handles typing efficiently, integrates Zod rules |
| **Derived state** | Calculated during render (not stored) | cart `count`, sizes for the chosen colour, shipping fee, total | Storing it would risk it going out of sync |
| **Persistent state** | localStorage + cookie | tokens; in mock mode also cart, orders, registered users, payments | Survives page reloads and container restarts |

---

## 9. Walkthroughs of real user flows

### 9.1 Filtering products

```
1. User clicks "Size M" in ProductFilters (client).
2. apply({ size: "M" }) builds the new URL, resets page to 1:
      router.push("/products?category=men&size=M")
3. Next.js navigates client-side → requests the RSC payload for that URL.
4. Server re-runs ProductsPage with searchParams { category:"men", size:"M" }
      → api.getProducts(query) → mockApi filters products.json
5. New ProductCards + Pagination arrive; ProductFilters gets a new `key`
   (because the query changed) so its inputs reset to match the URL.
6. Navbar/cart are untouched (layout stays mounted).
```

### 9.2 Adding to the cart

```
1. AddToCart: user picks colour → setColor(); size → setSize(); qty → setQty()
   (local state; derived: `variant` = the matching variant for colour+size)
2. Click "Add to cart" → onAdd() → setBusy(true)
3. useCart().add(variant.id, qty)
4. CartContext → api.addToCart()
      mockApi: checks stock in products.json  ← simulates FastAPI asking Django
               saves to localStorage "mock_cart"
5. CartContext setCart(newCart)
      → Navbar badge re-renders with the new count
6. AddToCart shows "Added … View cart" (or the stock error).
```

### 9.3 Logging in

```
1. /login: React Hook Form collects email + password; Zod validates format.
2. onSubmit → useAuth().login(email, password)
3. AuthContext:
      tokens = await api.login()       → { access, refresh }
      setTokens(tokens)                → localStorage + "access_token" cookie
      setUser(await api.me())          → Navbar shows "Hi, Demo" + "My Orders"
4. router.push(next)  e.g. back to /checkout (now allowed by middleware,
                      because the cookie exists)
```

On a later visit, `AuthProvider`'s `useEffect` finds the token and calls
`api.me()` to restore the session automatically.

### 9.4 Checkout and payment

This mirrors the microservice checkout flow from the plan:

```
 UI (checkout/page.tsx)             mockApi today            Real system later
 ──────────────────────             ─────────────            ─────────────────
 Step 1: address form
   Zod validates (mobile, PIN)
   api.checkout(address) ─────────► re-check stock,          FastAPI → Django:
                                    create order PENDING,      verify stock & price,
                                    create payment PENDING     create order
   setResult({order, payment})  ◄──
 Step 2: mock payment screen
   api.confirmPayment(id, true) ──► payment SUCCESS,         FastAPI publishes
                                    order → PAID,              "payment.succeeded";
                                    clear cart                 Django marks PAID
   useCart().refresh()          → Navbar badge goes to 0
   router.push(/orders/1003?placed=1)
 Order page: shows 🎉 banner because of ?placed=1
```

---

## 10. Styling

- **Tailwind CSS v4** is loaded with one line in `app/globals.css`:
  `@import "tailwindcss";` and processed by `postcss.config.mjs`.
- Most styling is utility classes directly on elements:
  `className="rounded-lg border border-stone-200 p-5 hover:shadow-md"`.
- Repeated patterns are named once in `globals.css` under `@layer components`:
  `.container-page`, `.btn-primary`, `.btn-secondary`, `.input`, `.field-error`.
- **Responsive design** uses Tailwind's mobile-first prefixes:
  `grid-cols-2 md:grid-cols-4` means 2 columns on phones and 4 from tablet width up.
  The Navbar switches to a ☰ menu below `md`.
- **Product images** are an SVG garment shape filled with the variant colour
  (`ProductImage.tsx`), so the app works offline with no image hosting.

---

## 11. How to add a new page (step by step)

Example: a **Wishlist** page at `/wishlist`.

1. **Create the route:** `src/app/wishlist/page.tsx`. The folder name becomes the URL.
2. **Decide server or client.** A wishlist is personal, so make it a client
   component: add `"use client"` on the first line.
3. **Add types** in `src/types/index.ts` (e.g. `WishlistItem`) and new methods to
   the `ApiClient` interface (`getWishlist()`, `addToWishlist()`).
4. **Implement them in both** `mockApi.ts` (localStorage) and `httpApi.ts`
   (endpoint). TypeScript will tell you if one is missing.
5. **Build the UI** from existing components (`ProductCard`, `ProductImage`).
6. **Link to it** from `Navbar.tsx` with `<Link href="/wishlist">`.
7. **Protect it** (optional): add `"/wishlist"` to the `matcher` in `middleware.ts`.
8. Run `npm run build` to type-check, then rebuild the container.

---

## 12. Glossary

| Term | Meaning |
| --- | --- |
| **App Router** | Next.js routing system where folders in `app/` define URLs. |
| **SSR** (Server-Side Rendering) | HTML generated on the server for each request. Used by `/products`. |
| **SSG** (Static Site Generation) | HTML generated once at build time. |
| **ISR** (Incremental Static Regeneration) | SSG that refreshes in the background after a time limit. Home uses `revalidate = 60`. |
| **CSR** (Client-Side Rendering) | Data fetched and rendered in the browser. Used by cart, orders. |
| **Server component** | React component that runs only on the server and sends no JS to the browser. |
| **Client component** | Component marked `"use client"`; it can use state, effects and events. |
| **Hydration** | React attaching event handlers to server-rendered HTML in the browser. |
| **RSC payload** | Compact description of server component output that Next.js sends during navigation. |
| **Suspense** | React feature that shows a fallback (our `loading.tsx`) while something loads. |
| **Context** | React feature to share state with many components without passing props. |
| **Custom hook** | A function starting with `use` that wraps reusable logic, e.g. `useCart()`. |
| **Middleware** | Code that runs on the server before a request reaches a page. |
| **JWT** | JSON Web Token: the login token sent as `Authorization: Bearer …`. |
| **Mock API** | A fake backend implementation used for development and testing. |
