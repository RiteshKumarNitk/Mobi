# Production Readiness Audit — Baba Communication (Mobi)

**Date:** 2026-11-22 · **Scope:** `apps/api`, `apps/web`, `apps/admin`, CI, Docker, config. `mobile/` was out of scope and not modified.
**Baseline:** commit `bac59f3`. Typecheck clean, 27/27 API tests passing — but the tests passed explicit `items` to order creation, which hid the broken cart → checkout path (C1).

Severity: **Critical** = money, data integrity or account takeover, or a core journey broken · **High** = serious security or correctness defect · **Medium** = real defect with limited blast radius · **Low** = hygiene, UX, accessibility.

Status: **FIXED** (see `PRODUCTION_FIXES.md`) · **OPEN** (see `KNOWN_LIMITATIONS.md`) · **BLOCKED** (needs credentials or a business decision).

## Summary

| Severity | Found | Fixed | Open / Blocked |
|---|---|---|---|
| Critical | 7 | 5 | 2 (SMS gateway, live Razorpay) |
| High | 16 | 15 | 1 (GST not computed) |
| Medium | 21 | 21 | 0 |
| Low | 8 | 8 | 0 |

---

## Critical

### C1 — Signed-in customers could not check out from their cart — FIXED
- **Files:** `apps/api/src/routes/cart.ts`, `apps/api/src/routes/orders.ts`
- **Repro:** log in → add to cart → checkout → "Your cart is empty".
- **Cause:** the cart router had no auth middleware, so `req.user` was never set and every cart line was stored against the browser's `x-device-id`. `POST /orders/create` reads the cart by `userId`, so it found nothing. Wishlist "move to cart" and "reorder" wrote `userId` lines that the cart page then never showed.
- **Impact:** the primary purchase journey failed for every customer.
- **Fix:** optional auth on the cart, plus an atomic merge of the guest cart into the account cart.
- **Verification:** found by reading the code, not reproduced on the old build. Regression tests now cover it (API, plus the browser E2E test).

### C2 — Mock payments could mark real orders "paid" in production — FIXED
- **Files:** `apps/api/src/lib/razorpay.ts`, `apps/web/app/checkout/page.tsx`
- **Repro:** deploy without `RAZORPAY_KEY_*` → choose online payment → click OK on the "simulate payment" dialog → the order is marked paid. With no keys, `verifyRazorpaySignature` returned `true` for any input.
- **Impact:** goods shipped against payments that never happened. Anyone could POST `/payments/verify` with an arbitrary signature.
- **Fix:** explicit payment modes. `mock` is impossible when `NODE_ENV=production`; production without keys is `disabled` (COD only). The storefront has real Razorpay Checkout.

### C3 — Overselling under concurrent checkout — FIXED
- **File:** `apps/api/src/routes/orders.ts`
- **Cause:** the stock check ran outside the transaction, and the decrement was unconditional.
- **Repro:** 5 parallel orders for a product with stock 2 → all succeed, stock goes negative.
- **Fix:** a conditional decrement (`stockQuantity >= qty`) inside the transaction, plus a DB `CHECK (stockQuantity >= 0)`. Test: exactly 2 of 5 succeed.

### C4 — Unpaid online orders were marked paid when delivered — FIXED
- **File:** `apps/api/src/routes/admin/orders.ts`
- **Cause:** `delivered` set `paymentStatus = paid` for every order, including Razorpay orders that were never paid.
- **Fix:** delivery marks only COD orders paid. Online orders become paid only through a verified callback or webhook.

### C5 — Payment verification not bound to order or amount; no webhook — FIXED
- **File:** `apps/api/src/routes/payments.ts`
- **Cause:** a valid signature for *any* Razorpay order was accepted for *any* of the customer's orders (pay for a cheap order, replay it on an expensive one). The gateway order id was never stored, the amount was never checked, and an interrupted checkout could never reconcile.
- **Fix:** `Payment.gatewayOrderId` binding, a timing-safe HMAC, a server-side fetch of the captured amount, idempotent updates, and a signed webhook with an event-id ledger.

### C6 — No SMS gateway: registration and password reset cannot work in production — BLOCKED
- **File:** `apps/api/src/lib/otp.ts` (it previously only logged the code)
- **Impact:** with debug OTPs correctly disabled in production, new customers cannot verify their phone and nobody can reset a password.
- **Needs:** an SMS provider account (MSG91, Twilio, Gupshup, …). An adapter boundary exists in `src/lib/sms.ts`.

### C7 — Live Razorpay integration never exercised — BLOCKED
- **Detail:** no test or live keys were available. The checkout.js flow, server-side `payments.fetch`, and webhook delivery from Razorpay's servers are implemented and unit/integration-tested against the mock gateway only.

## High

| ID | Finding | Files | Status |
|---|---|---|---|
| H1 | Storefront calls `/api/pages`, `/api/blog`, `/api/faqs`, `/api/contact`, `/api/newsletter/subscribe`, `/api/company-info`, but the API mounted them only under `/api/content/*`. Every CMS/legal page, blog, FAQ, contact form and newsletter signup returned 404. | `routes/index.ts` | FIXED |
| H2 | A deactivated customer could re-activate themselves with `POST /otp/send` + `/otp/verify {purpose:"register"}` (which always set `status=active`). Deactivated users kept working tokens until JWT expiry, and their refresh tokens were not revoked. | `routes/otp.ts`, `middleware/auth.ts`, `routes/admin/customers.ts` | FIXED |
| H3 | Refresh tokens were accepted as access tokens (no `type` check), giving a 30-day "access token". | `middleware/auth.ts` | FIXED |
| H4 | `staff` (lowest admin role) could create, edit and deactivate **any** user via `/admin/customers` (including admins), download full JSON backups (all orders and PII), and read settings and activity logs (IP addresses). | `routes/admin/customers.ts`, `system.ts` | FIXED |
| H5 | Path traversal in `GET /admin/backups/:id/download`: `..%2F..%2Fpackage` read arbitrary `.json` files from the server. | `routes/admin/system.ts` | FIXED |
| H6 | Refund bug: an operator-precedence error (`a ?? b ? c : d`) defaulted every refund to the **full order total**. No cap, repeatable, allowed on any return status, and partial refunds marked the whole payment "refunded". | `routes/admin/orders.ts` | FIXED |
| H7 | Return requests did not check that items belong to the order or that quantities stay within what was bought, so a customer could return items from other orders, or 1000× quantities. | `routes/returns.ts` | FIXED |
| H8 | `trust proxy = true` let any client set `X-Forwarded-For`, bypassing every IP rate limit (login, OTP, contact). | `app.ts` | FIXED |
| H9 | Stored XSS: CMS pages and blog HTML were rendered with `dangerouslySetInnerHTML` unsanitized (any `content.edit` manager could steal customer tokens), and banner `linkUrl` accepted `javascript:`. | `admin/content.ts`, `admin/marketing.ts` | FIXED |
| H10 | `OTP_DEBUG` defaulted to `true`, including in production, which returned OTPs in API responses. Codes were also logged to stdout, generated with `Math.random`, and stored in plaintext. | `lib/env.ts`, `lib/otp.ts` | FIXED |
| H11 | Seeded demo credentials (`9999999999 / Admin@123`) would authenticate on any seeded DB. The seed had no production guard, and the password is published in README and on the login page. | `prisma/seed.ts`, `routes/auth.ts`, `web/app/login` | FIXED |
| H12 | Coupon global usage limit raced (check-then-increment). The order-time coupon minimum used base prices, while the cart used bulk prices, so cart and checkout could disagree. | `routes/orders.ts`, `lib/coupons.ts` | FIXED |
| H13 | Inventory `stock_out` beyond the available stock was silently clamped to 0, with a wrong audit delta. "Set to N" adjustments were not atomic with concurrent orders. | `routes/admin/catalog.ts` | FIXED |
| H14 | Critical advisories in `next` (15.5.23) and `proxy-addr`. | `package-lock.json` | FIXED (15.5.29) |
| H15 | CI triggered only on `main`, but the repo's branch is `master`, so CI never ran on push. API tests were silently skipped without secrets. | `.github/workflows/ci.yml` | FIXED |
| H16 | **GST is never computed:** `taxAmount` is always 0 and invoices show CGST/SGST of ₹0, while the terms say "prices are exclusive of GST". | `routes/orders.ts`, `lib/invoice.ts` | **BLOCKED** (business rules: rates per HSN, intra/inter-state) |

## Medium

| ID | Finding | Status |
|---|---|---|
| M1 | `/otp/send` sent SMS to any number (SMS-bombing and cost abuse). `forgot-password` revealed whether a number is registered, and login timing revealed it too. | FIXED |
| M2 | Number squatting: an unverified registration permanently blocked the real owner of that phone number. | FIXED |
| M3 | Password minimum was 6 characters, bcrypt cost 10. No change-password endpoint. | FIXED (8+ with letters+digits, cost 12, `/auth/change-password`) |
| M4 | Open redirect: `/login?next=https://evil.com`. | FIXED |
| M5 | Malformed JSON, Prisma "not found"/unique errors and bad filter values returned 500. | FIXED |
| M6 | `/blog/categories` was shadowed by `/blog/:slug`, so it always returned 404. | FIXED |
| M7 | Swagger UI was public in production. CORS `*` was combined with `credentials: true`. | FIXED |
| M8 | Settings accepted any value (`shipping_flat_rate: "abc"` → NaN order totals) and arbitrary keys. | FIXED |
| M9 | Double-submitted cancel restored stock twice. Status transitions were not atomic. Cancelling a paid order marked the payment "failed". | FIXED |
| M10 | `stockStatus` was never updated by orders or cancellations, so "In stock" badges went stale. | FIXED |
| M11 | Public guest tracking exposed internal status notes. | FIXED |
| M12 | Mailer claimed `ok: true` and logged message bodies (PII); OTP codes were logged. | FIXED |
| M13 | Personal API responses (cart, orders, addresses) were cacheable (ETag/304, no `Cache-Control`). | FIXED |
| M14 | Web and admin sessions silently ended after 1 hour (refresh token never stored or used). | FIXED |
| M15 | Cart, checkout and order-detail two-column layout had no responsive CSS, so the page overflowed at 375–768 px. | FIXED |
| M16 | No per-page titles, canonical URLs, robots.txt, sitemap, structured data or `noindex` on private pages. | FIXED |
| M17 | CSV import accepted negative or NaN prices and stock. Bulk pricing could be half-configured or above the unit price. | FIXED |
| M18 | Reviews were unbounded per request, with unlimited duplicates per user. | FIXED |
| M19 | Web Dockerfile copies `apps/web/public` (and admin `public`), which didn't exist, so the image build failed. | FIXED |
| M20 | Unhandled errors in the UI: checkout "Save & Use" address, order cancel/reorder, admin refund. Failures gave no message. | FIXED |
| M21 | Admin return notes saved by re-sending the current status (would break under a state machine). There was no return state machine at all (completed → pending allowed). | FIXED |

## Low

| ID | Finding | Status |
|---|---|---|
| L1 | Form labels not associated with inputs (register, checkout address), no `:focus-visible` styling, carousel ignores reduced-motion. | FIXED |
| L2 | No security headers on storefront/admin. Admin panel indexable. | FIXED |
| L3 | Client `X-Request-Id` echoed unvalidated (header/log injection). Query strings (search terms, phones) logged. | FIXED |
| L4 | In-memory rate-limit map never pruned (memory growth). | FIXED |
| L5 | Footer "Return Policy" linked to non-existent `/returns`. | FIXED |
| L6 | Demo credentials shown on the production login page. | FIXED (dev only) |
| L7 | 5 MB third-party tool database and logs (`.freebuff/`) committed to git. No live secrets found in them. | FIXED (untracked + ignored) |
| L8 | Destructive `db:reset` (`db push --force-reset`) had no production guard. No version-controlled migrations. | FIXED |

## Not defects / verified OK
- Prisma parameterises all queries. The two raw SQL statements added use tagged templates (parameterised).
- bcrypt password hashing. JWT HS256 (now pinned). Order and address ownership checks (`userId`) on customer endpoints were already correct.
- Catalog TTL cache holds only public catalog data, never per-user data.
