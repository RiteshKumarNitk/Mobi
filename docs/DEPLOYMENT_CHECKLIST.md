# Deployment Checklist

Nothing in this repository has been deployed. Work through this list top to bottom for every production environment. Items marked 🔒 are enforced by the API: it refuses to boot until they are fixed.

## 1. Infrastructure
- [ ] Production PostgreSQL. Use a separate Neon project or branch from dev/test; never share the dev database.
- [ ] Point-in-time restore / automated backups enabled on the DB, with retention ≥ 7 days. Test a restore once before launch.
- [ ] Three services: API (`:4000`), storefront (`:3000`), admin (`:3001`). Either `docker compose up -d --build` or a host process manager (systemd, pm2) with auto-restart.
- [ ] Domains, for example:
  - `shop.example.com` → web
  - `admin.example.com` → admin (restrict by IP / VPN / SSO if possible)
  - `api.example.com` → API
- [ ] TLS on all three (Let's Encrypt or a managed LB). HTTP → HTTPS redirect.
- [ ] Reverse proxy (nginx / LB) in front of the API:
  - `client_max_body_size 6m` (CSV import is up to 5 MB).
  - Forward `X-Forwarded-For` / `X-Forwarded-Proto`.
  - Rate limiting at the proxy as well. The API's limiter is per-process and in memory.
  - Do not cache `/api/*`. The API already sends `Cache-Control: no-store`.
- [ ] Health check: `GET /health` (checks the DB). Alert on non-200.
- [ ] Logs: the API writes JSON lines to stdout. Ship them to a collector (CloudWatch, Loki, Datadog), keep ≥ 30 days, and alert on `level=error`, especially `payment_amount_mismatch`, `webhook_rejected`, `gateway_order_failed` and `config_error`.
- [ ] Error monitoring (Sentry or APM). Not integrated yet.

## 2. API environment (`apps/api/.env` or the secret manager)

| Variable | Production value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Enables every guard below |
| `DATABASE_URL` 🔒 | production Postgres URL | Must be set |
| `JWT_SECRET` 🔒 | `openssl rand -hex 32` | ≥ 32 characters; placeholders refused. Rotating it logs everyone out |
| `CORS_ORIGINS` 🔒 | `https://shop.example.com,https://admin.example.com` | `*` refused |
| `TRUST_PROXY` | `1` (one proxy hop) | Required behind nginx/LB, or rate limits key on the proxy IP |
| `OTP_DEBUG` | `false` (ignored in prod anyway) | |
| `SMS_PROVIDER` + provider credentials | **BLOCKED** | Without SMS, registration and password reset do not work (see `KNOWN_LIMITATIONS.md`) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` 🔒 | live keys (both or neither) | Without them online payment is **disabled** (COD only) |
| `RAZORPAY_WEBHOOK_SECRET` | from the Razorpay dashboard | Needed to reconcile interrupted payments |
| `API_DOCS_ENABLED` | unset / `false` | Swagger stays private |
| `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | `1h` / `30d` | |

No secrets go in the web or admin apps. They only receive `NEXT_PUBLIC_*` values, which are public by design.

## 3. Storefront & admin build arguments
- Web:
  - `NEXT_PUBLIC_API_URL=https://api.example.com/api`
  - `NEXT_PUBLIC_SITE_URL=https://shop.example.com`
  - Optional `API_INTERNAL_URL`: the server-side API address used for SEO metadata and the sitemap.
- Admin: `NEXT_PUBLIC_API_URL=https://api.example.com/api`
- Both values are baked in at build time, so rebuild after changing them.

## 4. Database migration (first deploy and every release)
1. **Back up first.** Use a Neon branch or snapshot, or `pg_dump`.
2. Check status: `npm run db:migrate:status`.
3. Apply: `npm run db:migrate` (`prisma migrate deploy`), or let the compose `migrate` service do it.
4. **Never** run `db:push`, `db:reset` or `db:seed` against production. Seed and reset refuse to run with `NODE_ENV=production`.
5. **Existing database created with `db push` (like the current dev DB):** mark the baseline once with `npx prisma migrate resolve --applied 0_init --schema apps/api/prisma/schema.prisma`, then run `db:migrate`.
6. Release `20261122000000_payments_hardening` is additive: new nullable/defaulted columns, a new table and CHECK constraints. Before applying it, confirm no rows violate the constraints:
   ```sql
   SELECT count(*) FROM "Product" WHERE "stockQuantity" < 0;
   SELECT count(*) FROM "Coupon" WHERE "usageLimit" IS NOT NULL AND "usedCount" > "usageLimit";
   SELECT count(*) FROM "Order" WHERE "totalAmount" < 0 OR subtotal < 0;
   ```
   Rollback (data-safe, removes only the additions):
   ```sql
   ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_stockQuantity_nonnegative";
   ALTER TABLE "Order"   DROP CONSTRAINT IF EXISTS "Order_amounts_nonnegative";
   ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_amounts_nonnegative";
   ALTER TABLE "Coupon"  DROP CONSTRAINT IF EXISTS "Coupon_usage_within_limit";
   DROP TABLE IF EXISTS "PaymentEvent";
   DROP INDEX IF EXISTS "Payment_gatewayOrderId_key"; DROP INDEX IF EXISTS "Payment_orderId_idx";
   ALTER TABLE "Payment" DROP COLUMN IF EXISTS "gatewayOrderId", DROP COLUMN IF EXISTS "refundedAmount", DROP COLUMN IF EXISTS "failureReason";
   ALTER TABLE "Order" DROP COLUMN IF EXISTS "refundedAmount";
   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261122000000_payments_hardening';
   ```
   Roll back the application code together with the schema; the new code requires the new columns.

## 5. Accounts and data
- [ ] Do **not** seed production. Create the real super-admin directly, or seed a staging DB.
- [ ] If the production DB was ever seeded, rotate both demo accounts before go-live (demo passwords are refused at login in production anyway):
  ```bash
  NEW_PASSWORD='<strong password>' npm run admin:set-password -w @baba/api -- 9999999999
  ```
  Then deactivate or delete the demo customer `8888888888` and remove demo orders, reviews and coupons.
- [ ] Real company settings in Admin → Settings: company name, address, GST number, shipping rate and free-shipping threshold, low-stock threshold.
- [ ] Real catalogue with real image URLs (placeholder `placehold.co` images in seed data).
- [ ] Legal CMS pages reviewed by the business: privacy, terms, shipping, returns, cancellation.

## 6. Payments (Razorpay)
- [ ] Complete Razorpay KYC and obtain live keys. First run end-to-end with **test** keys on staging.
- [ ] Webhook: URL `https://api.example.com/api/payments/razorpay/webhook`. Events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`. Set `RAZORPAY_WEBHOOK_SECRET`.
- [ ] Staging acceptance with test keys:
  - successful card/UPI payment
  - failed payment
  - closing the modal, then "Pay now"
  - closing the tab after paying (the webhook must mark the order paid)
  - a replayed webhook (must be a no-op)
- [ ] Agree the refund procedure. The admin "refund" action **records** the refund. Finance issues it in the Razorpay dashboard (online orders) or by bank transfer (COD).

## 7. Security sign-off
- [ ] `npm audit --omit=dev --audit-level=critical` passes (CI enforces this).
- [ ] Admin panel not publicly discoverable: `noindex` is set. Add an IP allow-list or VPN if possible.
- [ ] Verify the response headers on all three domains (HSTS, nosniff, frame options).
- [ ] Consider a Content-Security-Policy for the storefront once tested with Razorpay Checkout (not set yet).

## 8. Go-live smoke (production, read-only where possible)
- [ ] `GET /health` → 200; the API boot log shows `payments: "razorpay"` and `otpDebug: false`.
- [ ] Home, product, category and CMS pages render. `robots.txt` and `sitemap.xml` are served with the production domain.
- [ ] Register a real staff phone (needs SMS) → OTP → login → place a COD order → cancel it.
- [ ] One small real online payment, then refund it through the Razorpay dashboard.
- [ ] Admin login. A staff account sees no Settings, Roles or Logs.

## 9. Rollback plan
- Keep the previous image tags or build artefacts; roll back with `docker compose up -d` on the previous tag.
- The schema migration is additive. Roll the code back first. Only drop the additions (SQL above) if the schema itself must be reverted.
- Point-in-time restore is the last resort for data problems. Note the timestamp before each release.
