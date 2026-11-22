# Baba Communication — Mobile Spare Parts B2B eCommerce Platform

Complete B2B eCommerce platform for **Baba Communication** (by InnovateX Technology Pvt. Ltd.),
similar in business capability to CellSpare.com:

- 🛒 **Customer website** (Next.js) — browse, search, filter, cart, checkout, orders, returns, reviews, blog, FAQs
- 📱 **Android app** (Flutter) — in-app browser that loads the website, so the storefront is maintained once and works identically on web and mobile
- 🔐 **Admin panel** (Next.js) — dashboard, products, inventory, orders, customers, coupons, banners, CMS, settings, roles, logs
- ⚙️ **REST API** (Node.js + Express + Prisma) — all business logic, JWT + OTP auth, Razorpay payments

## Tech Stack

| Component | Technology |
|---|---|
| API | Node.js + Express + TypeScript |
| ORM / DB | Prisma + PostgreSQL (Neon, serverless) |
| Customer website | Next.js 15 (App Router) |
| Admin panel | Next.js 15 (App Router) |
| Android app | Flutter 3 (Dart) + webview_flutter (in-app browser) |
| Auth | JWT (access + rotating refresh) + OTP (5 min expiry) |
| Payments | Razorpay Checkout + signed webhooks (dev-only mock without keys; **disabled**, COD-only, in production without keys) |
| Hosting (prod) | Any cloud; `docker-compose.yml` runs the full stack (API + web + admin) |

## Quick Start

Requirements: Node.js 22+, npm 10+.

```bash
# 1. Install all workspaces
npm install

# 2. Point the API at your Postgres database
#    Put your Neon (or any Postgres) connection string in apps/api/.env as DATABASE_URL,
#    then apply the versioned migrations and seed the demo catalog (dev DBs only):
npm run db:migrate
npm run db:seed

# 3. Run all three apps (three terminals, or use your own process manager)
npm run dev:api    # http://localhost:4000   (REST API)
npm run dev:web    # http://localhost:3000   (Customer website)
npm run dev:admin  # http://localhost:3001   (Admin panel)
```

The API prints every request; `/health` reports liveness.

### Demo accounts (seeded — development only)

> These passwords are public. The seed refuses to run with `NODE_ENV=production`, and the API rejects these passwords at login in production. See `docs/DEPLOYMENT_CHECKLIST.md`.

| Role | Phone | Password |
|---|---|---|
| Super Admin | `9999999999` | `Admin@123` |
| Customer (shop) | `8888888888` | `Customer@123` |

**OTP in dev:** with `OTP_DEBUG=true` (default outside production), the generated OTP is returned in the API
response (`debugCode`) and shown on the register/login/forgot screens, so registration works without an SMS gateway.
`OTP_DEBUG` is forced off in production — a real SMS provider is required there (not integrated yet; see `docs/KNOWN_LIMITATIONS.md`).

### Useful scripts (run from repo root)

```bash
npm run dev:api      # API with hot reload
npm run dev:web      # storefront on :3000
npm run dev:admin    # admin on :3001
npm run build        # build all three workspaces
npm run typecheck    # tsc --noEmit across all workspaces
npm run db:migrate   # apply versioned migrations (prisma migrate deploy) — use this in production
npm run db:migrate:status
npm run db:seed      # demo data (idempotent; refuses NODE_ENV=production)
npm run db:reset     # wipe + re-seed (dev only; refuses NODE_ENV=production)
npm run test:e2e     # Playwright browser tests (needs API + web running)
```

API tests (Vitest + Supertest against the live database — register/login, admin
access gates, search, bulk pricing, order state machine, returns & refunds,
coupons; self-cleaning):

```bash
npm test                          # run the API test suite (Vitest + Supertest)
```

Browser E2E (Playwright; API + storefront must be running, dev DB only):

```bash
npx playwright install chromium   # once
E2E_WEB_URL=http://localhost:3000 npm run test:e2e
```

API smoke test (requires the API running):

```bash
bash apps/api/scripts/smoke.sh
```

API load test (requires [k6](https://k6.io)):

```bash
npx k6 run apps/api/scripts/load-test.js                       # against localhost
npx k6 run -e API_URL=https://api.example.com/api apps/api/scripts/load-test.js
```

Interactive API reference (Swagger UI — served by the API itself):

```
http://localhost:4000/api/docs      # rendered docs (disabled in production unless API_DOCS_ENABLED=true)
http://localhost:4000/api/docs.json # OpenAPI 3.0 spec (JSON)
```

### Android app (`mobile`)

The app is an **in-app browser** — it renders the customer website full-screen, so the
website is the single source of truth (auth, catalog, cart, checkout) and every change
to the website reflects in the app automatically. The earlier native screens were
superseded but kept under `lib/screens/` for reference.

Requirements: Flutter 3.32+ (stable), Android SDK.

```bash
cd mobile
flutter pub get
# Emulator (website runs on the host machine):
flutter run --dart-define=APP_URL=http://10.0.2.2:3000
# Real device or deployed store:
flutter run --dart-define=APP_URL=https://your-store.example.com
```

Start the website + API first (`npm run dev:web`, `npm run dev:api`) — the app is just
a window into the site. For the emulator, the website must be able to reach the API
from inside the emulator (`NEXT_PUBLIC_API_URL=http://10.0.2.2:4000/api` at web build time).

```bash
cd mobile
flutter analyze                 # static analysis (clean)
flutter test                    # widget/unit tests
flutter build apk --debug       # debug APK (needs Android SDK licenses accepted)
```

## What's Implemented

### Customer website (`apps/web`)
Homepage (hero carousel, categories, featured/trending/new, offers, newsletter) · Products listing with
filters (category, brand, price, stock), 6 sort orders, grid/list toggle, pagination · Product detail
(gallery, specs, related, reviews, share) · Search with auto-suggest · Cart with coupons & save-for-later ·
Multi-step checkout (address → shipping → Razorpay/COD) · Wishlist · Login/Register with OTP · Forgot password ·
Account (orders, addresses, profile, notifications) · Order detail with progress timeline, invoice (print to PDF),
reorder, cancel, returns · Guest order tracking · Brands · Categories · Offers · FAQs · Blog · Static pages ·
Contact · Search results.

### Admin panel (`apps/admin`)
Login · Dashboard (revenue, orders, stock, customers, 30-day sales chart, top products, status distribution,
recent orders/customers) · Products (CRUD, flags, CSV bulk import) · Inventory (batch stock adjustments + history) ·
Orders (filters, detail, status flow, cancel) · Customers (CRUD, activate/deactivate) · Coupons (CRUD, usage) ·
Banners & Offers · Returns (approve/reject/refund) · FAQs · CMS pages · System settings (grouped key-values) ·
Roles & permissions · Activity logs (export).

### API (`apps/api`) — 100+ endpoints

Performance & hardening:
- **TTL cache** on all catalog reads (products, categories, brands, search suggest,
  banners) with `X-Cache: HIT/MISS` headers; invalidated automatically on every admin
  write. In-memory now, Redis-swappable via `apps/api/src/lib/cache.ts`.
- **Database indexes** on hot queries (orders by user/status/date, products by
  category/brand/status, notifications, activity logs, OTP, reviews, returns,
  inventory logs).
- **Observability** — every request gets an `X-Request-Id`; structured JSON request
  logs (method, path, status, duration, IP, UA); `/health` pings the DB and reports
  uptime.
- **Security** — refuses to boot in production with the default JWT secret; OTP
  send/resend rate-limited per phone+IP (prevents OTP bombing); `Retry-After` header
  on 429s.
Auth (register, login, refresh, logout, me, forgot/reset password) · OTP (send/verify/resend) ·
Products (filters, sort, pagination, featured/trending/new, related) · Categories & Brands ·
Search + suggest · Cart (guest via `x-device-id`, coupons) · Wishlist · Orders (create with stock decrement,
coupon, timeline; list/detail/cancel/reorder/invoice; guest track) · Payments (Razorpay order + signature verify,
mock mode without keys) · Reviews (+ helpful votes) · Returns · Notifications · Addresses · Customer profile/settings ·
Content (banners, pages, FAQs, blog, contact, newsletter, company info) · Admin (dashboard, catalog, inventory,
orders, customers, marketing, CMS, settings, roles, permissions, logs, reports, backups).

## Configuration

All configuration lives in `apps/api/.env` (copy from `.env.example`). The web and admin apps read
`NEXT_PUBLIC_API_URL` from their own `.env.local`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string, e.g. a Neon serverless URL (`postgresql://…neon.tech/…`) |
| `JWT_SECRET` | 32+ random chars; production refuses to boot otherwise |
| `OTP_DEBUG` | `true` returns OTP codes in responses (ignored in production) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Empty = mock gateway in dev, online payment disabled in production |
| `CORS_ORIGINS` | Comma-separated origins (`*` refused in production) |
| `TRUST_PROXY` | Proxy hops in front of the API (e.g. `1`) |

Full production list: `docs/DEPLOYMENT_CHECKLIST.md`.

### Database (Neon PostgreSQL)

The schema uses the `postgresql` provider. Put your Neon connection string in `apps/api/.env`
as `DATABASE_URL`, then:

```bash
npm run db:migrate   # create/update tables via versioned migrations
npm run db:seed      # demo catalog + admin/customer accounts (idempotent, dev only)
```

### Docker

The repo ships production `Dockerfile`s for all three apps plus a `docker-compose.yml`
for the full stack. Docker is **not** required for development (see Quick Start above);
this is for deploy or production-like local runs.

```bash
# 1. Create a .env with your secrets (see docker-compose.yml for the full list)
echo "DATABASE_URL=postgresql://…neon.tech/…" >> .env
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env

# 2. Build and start api (:4000) + web (:3000) + admin (:3001)
docker compose up -d --build

# Optional: local Postgres instead of Neon (offline dev)
docker compose --profile localdb up -d db
```

The API image runs `prisma generate` + compiles TypeScript, then runs `node dist/index.js`
with `NODE_ENV=production` (the production boot guard refuses the default JWT secret).
The web/admin images bake `NEXT_PUBLIC_API_URL` at build time (build arg; defaults to
`http://localhost:4000/api`). A one-shot `migrate` service applies migrations before the API starts.
Image builds have not been verified yet (see `docs/KNOWN_LIMITATIONS.md`).

### CI/CD

`.github/workflows/ci.yml` runs on every push to `master`/`main` and every PR: typecheck → build →
production dependency audit, plus the API test suite against a disposable Postgres service
(migrations + seed). No secrets needed; tests never run against a shared database.

### Going live checklist

The complete, current list is in **`docs/DEPLOYMENT_CHECKLIST.md`** (audit results: `docs/PRODUCTION_AUDIT.md`).

- [ ] Change `JWT_SECRET`, set `OTP_DEBUG=false`, add real Razorpay keys
- [ ] Point the app at the deployed store: `--dart-define=APP_URL=https://…`
- [ ] Wire up an SMS gateway for OTPs (`src/lib/otp.ts`) and SMTP for emails (`src/lib/mailer.ts`)
- [ ] Upload product images to Cloudinary/CDN and set `imageUrl`s (uploads endpoint not yet wired)
- [ ] Add HTTPS, WAF/rate limiting at the proxy, Sentry/APM monitoring
- [x] CI/CD via GitHub Actions (build → test → docker → deploy) — workflow in `.github/workflows/ci.yml`
- [x] API reference docs — Swagger UI at `/api/docs` (OpenAPI 3.0 spec)

## Project Structure

```
apps/
  api/                 Express + Prisma REST API
    prisma/schema.prisma   Full database schema (all modules)
    prisma/seed.ts         Demo data
    src/routes/            Customer + admin route groups
    src/lib/               auth, jwt, otp, razorpay, settings, helpers
    scripts/smoke.sh       End-to-end API smoke test
  web/                 Customer website (Next.js App Router)
    app/                   Pages (home, products, checkout, account, ...)
    components/            Header, Footer, ProductCard
    lib/                   api client, global store (auth+cart+wishlist)
  admin/               Admin panel (Next.js)
    app/                   Dashboard + management pages
    components/            AdminShell (sidebar layout)
    lib/                   Admin API client
mobile/                Flutter Android app (in-app browser)
  lib/main.dart             Splash → WebView loading the website (APP_URL)
  lib/screens/webview_screen.dart   Full-screen in-app browser shell
  lib/screens/             Superseded native screens (kept for reference)
  test/widget_test.dart    Unit + widget tests
```

## Security Notes
- bcrypt password hashing, JWT access + rotating refresh tokens, role-based access control
- Admin routes re-validate the user's role and status against the DB on every request, so a
  demoted/deactivated admin loses access immediately (not when the JWT expires)
- Zod validation on all inputs, rate limiting on auth/OTP/contact endpoints
- Parameterised queries via Prisma (no raw SQL), helmet security headers, CORS allow-list
- Activity logging on all admin mutations; backups snapshot core tables to JSON files

## Roadmap
1. ~~**Automated tests** — API suite done (Vitest + Supertest, 27 tests).~~ Next: frontend unit
   tests (React Testing Library) and Cypress/Playwright E2E for the key customer journeys.
2. ~~**CI/CD pipeline** — workflow in `.github/workflows/ci.yml` (typecheck → tests → build).~~
   Next: wire the secrets on your repo and add Docker build + deploy on merge.
3. **Production integrations** — real SMS gateway, SMTP, Cloudinary uploads, FCM push notifications,
   real Razorpay checkout (native SDK instead of the mock), Redis caching, Sentry.
4. **App polish** — push-to-refresh in the WebView, offline fallback screen, real device testing
   across Android 10+.
