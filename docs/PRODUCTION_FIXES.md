# Production Fixes

Each fix references its audit finding (`PRODUCTION_AUDIT.md`). Tests are listed in `TEST_REPORT.md`. No files under `mobile/` were changed.

## Phase 1 — Security & data integrity (API)

### Configuration and boot guard (C2, H10, M7, H8)
- `src/lib/env.ts`, `src/index.ts`. In production the API **refuses to start** when any of these holds:
  - `JWT_SECRET` is missing, shorter than 32 characters, or a known placeholder.
  - `CORS_ORIGINS` is empty or `*`.
  - Razorpay is half-configured (one key set without the other).
- Warnings are logged for: payments disabled, webhook secret missing, docs enabled.
- `OTP_DEBUG` is hard-forced to `false` in production.
- Swagger UI (`/api/docs`) is off in production unless `API_DOCS_ENABLED=true`.
- `trust proxy` now defaults to loopback/private networks and is configurable via `TRUST_PROXY`.
- CORS no longer uses credentials (auth is Bearer-only).
- `Cache-Control: no-store` is set on every API response, and ETags are disabled (M13).

### Authentication (H2, H3, H11, M1–M3, M14)
- `middleware/auth.ts`: every authenticated request re-reads role and status from the DB, so deactivated or deleted accounts lose access immediately. Refresh tokens are rejected as access tokens. Adds `optionalAuth` and `requireRole`.
- `lib/jwt.ts`: algorithm pinned to HS256; `type: "access"` claim added.
- `lib/tokens.ts`: atomic refresh-token consumption with **reuse detection**. Replaying a used token revokes all of that user's sessions. Expiry is read from the token itself.
- `routes/auth.ts`:
  - New password policy (`lib/passwords.ts`): 8+ characters, letters and digits, bcrypt cost 12.
  - Login uses constant-time comparison for unknown phones.
  - Demo passwords (`Admin@123`, `Customer@123`) are refused in production (`PASSWORD_RESET_REQUIRED`).
  - `forgot-password` gives an identical response whether or not the account exists.
  - An unverified registration can be re-claimed by the real number owner.
  - New `POST /auth/change-password`.
  - **API change:** `/auth/login` for an unverified phone now returns `OTP_REQUIRED` *without* sending the SMS. The client calls `/otp/send`, so the user doesn't get a duplicate SMS. The storefront handles this inline.
- `routes/otp.ts`: OTPs are only sent to numbers where the purpose applies; unknown numbers get the same response with no SMS. Verification never re-activates an `inactive` account and does not override "pending approval". Rate limits added on verify and reset.
- `lib/otp.ts`: `crypto.randomInt`, HMAC-hashed storage, timing-safe compare, single-use under concurrency, no code logging outside debug.
- `lib/sms.ts` (new adapter) and `lib/mailer.ts` report `delivered: false` instead of pretending they sent anything.
- `scripts/set-password.ts` (`npm run admin:set-password -w @baba/api -- <phone>`, password via the `NEW_PASSWORD` env var): rotates the seeded admin password before go-live.
- `prisma/seed.ts` and `db:reset` refuse to run when `NODE_ENV=production` (`scripts/guard-destructive.ts`).

### Payments (C2, C4, C5)
- `lib/razorpay.ts`: payment modes are `razorpay`, `mock` (dev only) and `disabled` (production without keys). Mock verification accepts only mock gateway orders. HMAC comparisons are timing-safe. New `verifyWebhookSignature` and `fetchGatewayPayment`.
- `lib/payments.ts` (new) is the **only** code path that marks an order paid:
  - Binds `Payment.gatewayOrderId` to the order.
  - Checks the amount, in paise, against the DB total.
  - Uses a conditional update, so it is idempotent under a concurrent callback and webhook.
  - Records status history, including "payment received after cancellation — REFUND REQUIRED".
- `routes/payments.ts`:
  - `GET /payments/config`.
  - `create-order` reuses the existing gateway order on retry.
  - `verify` rejects a gateway order that isn't this order's (`PAYMENT_ORDER_MISMATCH`), fetches the captured payment from Razorpay in live mode, and is idempotent.
  - New `POST /payments/failed`.
  - New **`POST /payments/razorpay/webhook`**: raw body, HMAC verified, and an event-id ledger (`PaymentEvent`), so each event is processed exactly once. Permanent rejections (unknown order, wrong amount) are acknowledged and logged. Transient errors are retried.
- `routes/orders.ts`: refuses `paymentMethod: "razorpay"` when payments are disabled, so no unpayable orders are created.
- `lib/orderOps.ts`: delivery marks only **COD** orders paid.

### Orders, stock, coupons (C1, C3, H12, M9, M10)
- `lib/stock.ts`:
  - `takeStock` decrements conditionally inside the order transaction, with merged lines and a stable lock order.
  - `returnStock` restores stock.
  - `syncStockStatus` uses the configured low-stock threshold.
- `lib/orderOps.ts`: a single status state machine (`ORDER_FLOW`) shared by customer and admin. Transitions are conditional on the current status, so a double cancel restores stock once. Cancelling a paid order flags "REFUND REQUIRED" instead of falsely marking it refunded or failed.
- `lib/coupons.ts`: the order-time minimum uses the same bulk-aware subtotal as the cart. `redeemCoupon` is an atomic SQL increment bounded by `usageLimit`.
- `routes/orders.ts`:
  - Money is computed only from DB prices.
  - Input sizes are bounded.
  - Only the ordered lines are removed from the cart (saved-for-later lines stay).
  - If gateway order creation fails, the order is saved and can be paid later ("Pay now").
  - The public tracking endpoint no longer exposes internal notes.
- `routes/cart.ts`:
  - Optional auth, so signed-in carts are stored per account.
  - **Guest → account cart merge**, serialized per user with `pg_advisory_xact_lock`. The first version raced when the storefront fired parallel cart requests at login; the E2E test caught it and it was fixed (regression test added).
  - Device ids are validated.
  - Line quantity limit raised from 99 to 9,999 (B2B volumes).

### Returns & refunds (H6, H7, M21)
- `routes/returns.ts`: items must belong to the order, and quantity can't exceed what was bought minus earlier non-rejected returns.
- `routes/admin/orders.ts`:
  - Return state machine: `pending → approved|rejected`, `approved → processed (refund)|rejected`, `processed → completed`.
  - A same-status update now means "update notes only".
  - Refunds are allowed only on approved returns of paid orders. The default amount is the value of the returned items, capped at `totalAmount − refundedAmount`. They are applied atomically, exactly once.
  - New `Order.refundedAmount` / `Payment.refundedAmount`. Only a full refund sets `refunded`.
  - The response includes `refundExecution: "manual"`: money movement is done by finance; no gateway refund call is made.

### Admin authorization & validation (H4, H5, H9, H13, M8, M17)
- `admin/customers.ts`: create, edit and deactivate are owner-only (`super_admin` / `admin`). Targets are restricted to role `customer`. Deactivation revokes sessions.
- `admin/system.ts`: settings, roles, logs and backups are owner-only. Settings keys and values are validated (numeric settings must be ≥ 0). Backup ids must match `^backup-…$`, which stops path traversal. Log export is bounded and never includes password hashes.
- `admin/catalog.ts`:
  - Bounded product schema. Bulk pricing must be consistent (both fields, box of 2+ units, box price ≤ unit price).
  - Stock edits are written to the inventory log.
  - Inventory adjustments lock the row (`SELECT … FOR UPDATE`) and **reject** negative results instead of clamping.
  - CSV import validates every row and reports row-numbered errors (max 5,000 rows).
- `admin/marketing.ts`: coupon codes validated; percentage ≤ 100; `endDate` after `startDate`. Banner image and link must be http(s) or site-relative (no `javascript:`).
- `admin/content.ts`, `routes/content.ts`, `lib/sanitize.ts`: CMS and blog HTML sanitized on write *and* on public read (allow-list via `sanitize-html`).

### API hygiene (H1, M5, M6, M18, L3, L4)
- Content routes mounted at `/api/*` (where the storefront calls them); `/api/content/*` kept for compatibility. `/blog/categories` route order fixed.
- Error handler: malformed JSON → 400 `BAD_JSON`; body too large → 413; Prisma P2025 → 404, P2002 → 409, P2003 → 409, P2023/validation → 400.
- Catalog filters validated (UUIDs, numeric prices, `ids` capped at 50). Search terms capped at 100 characters.
- Reviews: one per user per product, 50 per page, rate-limited, no full user rows loaded.
- Request-id validation. Query strings removed from request logs. Rate-limiter memory bounded.
- OpenAPI spec updated: new payment endpoints, webhook, change-password, new password rules.

### Database (Prisma)
- **Version-controlled migrations introduced** (`apps/api/prisma/migrations/`):
  - `0_init` is the baseline, identical to the pre-audit schema. On the dev DB it was marked applied with `migrate resolve`, so no SQL ran.
  - `20261122000000_payments_hardening` is additive only:
    - `Order.refundedAmount`, `Payment.gatewayOrderId` (unique), `Payment.refundedAmount`, `Payment.failureReason`, index `Payment(orderId)`.
    - New `PaymentEvent` table.
    - **CHECK constraints:** stock ≥ 0; order and payment amounts ≥ 0 with refunds ≤ total; coupon `usedCount ≤ usageLimit`.
    - Existing data was checked against the constraints before applying (0 violations).
- Scripts: `db:migrate` (`migrate deploy`), `db:migrate:status`. `db:reset` is guarded.

## Phase 2 — Storefront (`apps/web`)
- `lib/api.ts`: stores the refresh token and transparently refreshes on 401 (single-flight). New `safeNext()` stops open redirects.
- `lib/payment.ts` (new): **real Razorpay Checkout** (checkout.js) with server verification. Failure and dismiss are reported. "Pay now" retry. The mock gateway is clearly labelled "TEST MODE" and only exists when the API is in dev mock mode.
- Checkout:
  - Hides online payment when `onlineEnabled` is false.
  - Prefills name and contact for Razorpay.
  - Validates and handles errors when saving an address.
  - Redirects to the order page with a message if payment isn't completed.
- Order page: "Payment pending → Pay now" banner. Errors handled for cancel and reorder. "Not found" and expired-session states.
- Login: open-redirect fix; inline OTP step for unverified numbers; demo hint only in development.
- Register: 8-character policy hint; labels associated with inputs (`htmlFor`/`id`); `autocomplete` attributes.
- Footer: fixed the `/returns` 404 link.
- Layout and accessibility: responsive rules for the cart/checkout/order two-column grid, table overflow, skip-to-content link, `:focus-visible` outlines, `prefers-reduced-motion` (CSS and carousel autoplay).
- SEO:
  - Title template, `metadataBase`, Open Graph, canonical URLs.
  - Per-route titles and descriptions.
  - `noindex` layouts for account, cart, checkout, confirmation, orders, wishlist, login, register, forgot-password, track, quick-order and search.
  - `robots.txt` and dynamic `sitemap.xml` (products and blog).
  - Product pages render server-side metadata and schema.org `Product` JSON-LD from real catalogue data. Ratings are included only when approved reviews exist.
- `next.config.mjs`: security headers (nosniff, Referrer-Policy, `X-Frame-Options: SAMEORIGIN`, Permissions-Policy, HSTS in production). `poweredByHeader: false`.
- `public/` directory added (the Dockerfile requires it).

## Phase 3 — Admin (`apps/admin`)
- Refresh-token handling (sessions no longer die after 1 h).
- Settings, Roles and Activity Logs hidden from staff and managers (the API enforces this too).
- Returns: refund amount validation, confirmation dialog ("record only; send money via Razorpay/bank"), error handling. "processed" removed from manual status buttons (refunds go through the refund action).
- `noindex` metadata, `X-Robots-Tag`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `robots.txt` disallow-all. `public/` added.

## Phase 4 — Build, CI, deployment
- `.github/workflows/ci.yml`:
  - Runs on `master` and `main`, Node 22.
  - Prisma generate, typecheck, build, `npm audit --omit=dev --audit-level=critical`.
  - API tests against a **disposable Postgres service** (migrations, seed, tests). They always run; nothing is skipped silently.
- Dockerfiles: Node 22. Web image gets the `NEXT_PUBLIC_SITE_URL` build argument.
- `docker-compose.yml`:
  - One-shot `migrate` service (`prisma migrate deploy`) that the API waits for.
  - `CORS_ORIGINS` is now required.
  - Passes `TRUST_PROXY`, `RAZORPAY_WEBHOOK_SECRET` and `SMS_PROVIDER`.
  - Web gets `API_INTERNAL_URL`.
- Dependencies: `npm audit fix` (Next 15.5.29, proxy-addr). Express 4.22.3. Added `sanitize-html` and `@playwright/test`. Criticals: 2 → 0.
- `.env.example` files for api, web and admin. `.freebuff/` untracked and ignored.
- Playwright E2E suite (`e2e/`, `npm run test:e2e`).
