# Known Limitations & External Dependencies

## Blockers before public launch

| # | Item | Impact | What is needed |
|---|---|---|---|
| B1 | **No SMS gateway** (`apps/api/src/lib/sms.ts` is an adapter stub that reports "not delivered") | In production, OTPs cannot reach customers: **new registrations cannot be verified and password reset is impossible.** Existing verified users can still log in with a password. | SMS provider account + DLT-registered sender/template (India). Implement the provider branch in `sendSms`. Then test on staging. |
| B2 | **Live Razorpay never exercised** | The checkout.js flow, `payments.fetch` verification and real webhook deliveries are tested only against the mock gateway. Without keys, production runs **COD only** (online payment is disabled, never mocked). | Test keys → staging acceptance (see `DEPLOYMENT_CHECKLIST.md` §6) → live keys + webhook secret. |
| B3 | **GST is not calculated** | `Order.taxAmount` is always 0, and invoices show CGST/SGST ₹0 while the terms say prices are "exclusive of GST". This is a compliance risk. | Business decision: GST rates (per HSN or flat), whether catalogue prices are inclusive or exclusive, intra-state (CGST+SGST) vs inter-state (IGST) based on shipping state. Then implement in order creation and the invoice. |

## External services not integrated
- **Email:** `lib/mailer.ts` logs "email_not_sent". No order or password emails are sent. Needs SMTP / SES / Resend credentials.
- **Image upload / CDN:** there is no upload endpoint. Admins paste image URLs (validated as http(s)). Cloudinary/S3 variables exist in `.env.example` but are unused.
- **Refund execution:** the admin "refund" action records the refund (amount, caps, status) but does not call Razorpay's refund API. Finance must issue it manually.
- **Push notifications (FCM):** not integrated. Notifications are in-app only.
- **Error monitoring / APM:** not integrated.

## Functional limitations
- **Stock is held by unpaid online orders indefinitely.** A Razorpay order reserves stock at creation. If the customer never pays, an admin must cancel it (which restores stock). Recommended: a scheduled job that cancels unpaid online orders after N hours.
- **Customers may cancel orders in `processing`** (existing business rule, kept). Paid orders cancelled this way are flagged "REFUND REQUIRED" in the status history; there is no dedicated refund queue in the admin UI yet.
- Guest checkout is not supported; login is required to order. Guest carts are supported and merge on login.
- Order quantity per line is capped at 9,999 (was 99).
- Reviews are not restricted to verified purchasers (they are moderated: `pending` until approved).
- The public order-tracking endpoint is keyed by order number only (≈10⁹ space per day, rate-limited). It returns status and dates only.
- Dashboard and report figures were not independently reconciled against the database (spot checks only).

## Scaling limitations
- The rate limiter and catalog cache are **in memory, per process**. With more than one API replica, limits are per replica and admin writes do not invalidate other replicas' caches (60–300 s TTL). Move both to Redis before scaling horizontally (`lib/cache.ts` is designed for this), and enforce rate limits at the proxy.
- Activity-log export is capped at 50,000 rows. Backups are JSON files on the API container's disk (`data/backups`). They are not a substitute for database backups, and they are lost if the container is rebuilt without a volume.

## Security trade-offs (accepted for now)
- Access and refresh tokens live in `localStorage`. Mitigated by sanitized CMS HTML, React escaping, a 1 h access-token lifetime, and refresh-token rotation with reuse detection. HttpOnly cookies would be stronger but need same-site API hosting and CSRF protection; this is a larger change that also affects the Flutter WebView.
- No Content-Security-Policy on the storefront yet (Razorpay Checkout needs a tested allow-list).
- Remaining dependency advisories need **major** upgrades and were not forced:
  - Next.js 16: postcss via Next, moderate/high, build-time CSS tooling.
  - Zod 4: memory exhaustion on oversized collections, mitigated because every array input now has a `.max()` bound.
  - Prisma 7: CLI-only chain `@prisma/config` → `effect` / `deepmerge-ts`.

  No critical advisories remain. Plan these upgrades as separate, tested changes.

## Verification gaps
- **Docker images not built:** the Docker CLI exists on the audit machine, but the Docker Desktop engine was not running. The Dockerfiles follow the standard multi-stage pattern, and the missing `public/` directories that would have broken the web/admin builds were added. CI does not build images.
- **Core Web Vitals / Lighthouse not measured.** Only bundle sizes were measured: 103–112 kB first-load JS per storefront route.
- **Tablet (768/1024 px) layouts** were checked by CSS review only. E2E runs at 375 px and 1440 px.
- **Admin panel** has no browser E2E tests. Admin API behaviour is covered by API tests.
- **Mobile WebView** not tested (out of scope). The API and storefront stayed backward compatible, apart from the `OTP_REQUIRED` login change, which the storefront handles.
