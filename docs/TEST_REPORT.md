# Test Report

**Date:** 2026-11-22 · **Environment:** Windows 11, Node 24.19, npm 11.17, Neon PostgreSQL (dev database: seed data plus earlier test users, no live customers), API in development mode (mock payment gateway, `OTP_DEBUG=true`). No real SMS, email, payment or refund was sent.

Statuses: **PASS** · **FAIL** · **BLOCKED** (missing credentials or infrastructure) · **NOT TESTED**

## Command results

| Command | Result |
|---|---|
| `npm install` | PASS (npm 11 skips install scripts by default, so `prisma generate` was run explicitly) |
| `npm run typecheck` (api, web, admin) | PASS: 0 errors |
| `npm test` (Vitest + Supertest, live DB) | **PASS: 59/59 tests, 8 files** (baseline was 27/27, run time 344 s) |
| `npm run build` (api, web, admin) | PASS. Storefront first-load JS is 103–112 kB per route; admin 104–109 kB |
| `npx playwright test` (storefront E2E, production build) | **PASS: 8/8** (4 journeys × desktop 1440 px and mobile 375 px) |
| `bash apps/api/scripts/smoke.sh` | PASS. One step reports `ERR` because the seeded `WELCOME10` coupon **expired on 2026-11-12**; the API correctly rejects it |
| `npx prisma migrate status` | PASS: "Database schema is up to date" (2 migrations) |
| `npm audit --omit=dev --audit-level=critical` | PASS: 0 critical (was 2). 6 high and 1 moderate remain; they need major upgrades (see `KNOWN_LIMITATIONS.md`) |
| `docker build` (api) | **NOT TESTED**: Docker CLI present but Docker Desktop engine not running |
| CI workflow on GitHub | **NOT TESTED**: not pushed |
| Lighthouse / Core Web Vitals | **NOT TESTED** |

## Production-mode verification (manual, `NODE_ENV=production`, live HTTP)

| Check | Result |
|---|---|
| Boot with a 5-character `JWT_SECRET` and `CORS_ORIGINS=*` | PASS: refused to start, with both errors listed |
| Boot with valid config and no Razorpay keys | PASS: starts with `payments: "disabled"`, `otpDebug: false`, warnings logged |
| `OTP_DEBUG=true` in `.env` while in production | PASS: ignored; `forgot-password` returns `debugCode: null` |
| Login `9999999999 / Admin@123` in production | PASS: `403 PASSWORD_RESET_REQUIRED` |
| `/api/docs` in production | PASS: 404 |
| `GET /payments/config` in production without keys | PASS: `{ mode: "disabled", onlineEnabled: false }` |

## Feature verification

### Authentication

| # | Flow | Status | Evidence |
|---|---|---|---|
| 1 | Register → OTP → account active | PASS | API helper (every suite) + E2E |
| 1b | Weak password rejected (8+, letters + digits) | PASS | security.test |
| 1c | Unverified number re-claimable by the real owner | PASS | security.test |
| 2 | OTP verification, resend, hashed storage | PASS | auth.test |
| 2b | No OTP sent to unregistered or deactivated numbers | PASS | auth.test, security.test |
| 2c | Forgot password gives the same response for unknown numbers | PASS | security.test |
| 2d | Password reset via OTP | PASS (API, dev OTP) / **BLOCKED** in production (no SMS) | |
| 2e | Change password | PASS | security.test |
| — | Refresh rotation + reuse detection revokes all sessions | PASS | security.test |
| — | Refresh token rejected as access token | PASS | security.test |
| — | Deactivated user loses access immediately and cannot self-reactivate | PASS | security.test |
| — | Open redirect `?next=https://evil` ignored | PASS | E2E |
| — | Storefront/admin silent refresh after access-token expiry | PASS (code review + typecheck) / NOT TESTED end-to-end (1 h expiry) | |

### Catalogue & search

| # | Flow | Status | Evidence |
|---|---|---|---|
| 3 | Product browsing, filters, sort, pagination | PASS | catalog.test, smoke |
| 3b | Malformed filters → empty result, not 500 | PASS | security.test |
| 4 | Search + suggest (case-insensitive) | PASS | catalog.test, smoke |
| 5 | Product detail + bulk (box) pricing in cart and order | PASS | cart.test, orders.test |
| — | Product SSR metadata + JSON-LD (real data only) | PASS | curl on production build |

### Cart & checkout

| # | Flow | Status | Evidence |
|---|---|---|---|
| 6 | Add to cart / update quantity (guest + signed-in) | PASS | cart.test, checkout.test, E2E |
| 6b | Guest cart merged into account on login, including 4 concurrent requests | PASS | checkout.test, E2E |
| 7 | Valid / invalid / expired coupons | PASS | cart.test, smoke |
| 7b | Coupon global limit under 3 concurrent orders → exactly 1 succeeds | PASS | checkout.test |
| 8 | Save delivery address (checkout form) | PASS | E2E |
| 9 | Checkout COD from cart (server total = cart total) | PASS | checkout.test, E2E |
| 9b | Online checkout, mock gateway (dev) | PASS | checkout.test |
| 9c | Online checkout, **real Razorpay** | **BLOCKED** | no test or live keys |
| — | Oversell: 5 concurrent orders for stock 2 → exactly 2 succeed, stock 0 | PASS | checkout.test |
| — | Payment for order B cannot be replayed on order A | PASS | checkout.test |
| — | Verify is idempotent (second call is a no-op) | PASS | checkout.test |
| — | Online checkout refused when payments are disabled | PASS | checkout.test + production boot check |
| — | Webhook: bad signature 401, wrong amount ignored, valid marks paid, replay is a duplicate | PASS | checkout.test (signed locally) |
| — | Webhook delivered by Razorpay's servers | **BLOCKED** | needs keys and a public URL |
| — | Unpaid online order stays unpaid after "delivered" | PASS | checkout.test |
| 10 | Order confirmation page shows the order number | PASS | E2E |

### Orders, cancellation & returns

| # | Flow | Status | Evidence |
|---|---|---|---|
| 11 | Order history, detail, invoice, guest tracking | PASS | orders.test, smoke |
| 12 | Cancellation restores stock; double cancel restores it once | PASS | orders.test, checkout.test |
| 13 | Return request: foreign items and excess quantity rejected | PASS | returns.test |
| — | Refund: approved only, capped, default = item value, no double refund, partial vs full status | PASS | returns.test |

### Admin

| # | Flow | Status | Evidence |
|---|---|---|---|
| 14 | Admin login + admin access gates | PASS | auth.test, smoke |
| 15 | Product create / edit (API) | PASS | test helpers |
| 15b | Product CSV import validation | NOT TESTED (code review only) | |
| 16 | Inventory adjustment; stock-out beyond stock rejected | PASS | checkout.test |
| 17 | Order processing through the state machine; illegal transitions rejected | PASS | orders.test |
| 18 | Coupon creation (API) | PASS | cart.test |
| 19 | CMS update sanitized end-to-end; `javascript:` banner link rejected; settings validation | PASS | security.test |
| 20 | Role enforcement: staff blocked from customer writes, settings, logs, backups; admin accounts unreachable via the customers API | PASS | security.test |
| — | Backup path traversal blocked | PASS | security.test |
| — | Admin UI in a browser (all screens) | **NOT TESTED** | build + typecheck only |

### Storefront content, SEO & layout

| Flow | Status | Evidence |
|---|---|---|
| Content endpoints at the paths the storefront uses (pages, FAQs, blog, categories, company-info) | PASS | security.test, E2E |
| `robots.txt`, dynamic `sitemap.xml` with products, `noindex` on checkout | PASS | E2E, curl |
| Security headers on the storefront | PASS | curl |
| Responsive layout at 375 px (checkout, confirmation: no horizontal scroll) | PASS | E2E |
| Responsive layout at 768 / 1024 px | NOT TESTED (CSS review only) | |

### Integrations

| Integration | Status |
|---|---|
| SMS delivery | **BLOCKED**: no provider |
| Email delivery | **BLOCKED**: no provider |
| Image upload / CDN | **NOT TESTED**: not implemented |

## Bugs found by the new tests during this work
- **Guest-cart merge race** (my first implementation): the storefront issues parallel `GET /cart` requests at login; two merges of the same rows deleted the line. Caught by the Playwright journey and fixed with a per-user advisory lock. A regression test was added (4 concurrent requests).
- **Cacheable personal API responses:** `304`s were seen on `/api/cart` during E2E. Fixed: `Cache-Control: no-store`, ETag disabled.

## Test data notes
- API tests and E2E create customers (`9…` / `7…` phone numbers), products and orders on the dev DB. API tests clean up after themselves; E2E-registered users and their orders remain (dev DB only).
- An earlier run that was interrupted left a few `TST Product …` rows and test users. Harmless on the dev DB.
