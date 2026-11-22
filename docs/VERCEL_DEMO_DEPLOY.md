# Deploying the client-review demo on Vercel

The demo runs as **three Vercel projects from the same GitHub repo**, each with its own *Root Directory*. It uses the seeded demo data, takes **no payments** (Cash on Delivery only), and sends **no SMS**: OTPs are shown on screen.

| Project | Root Directory | Framework preset |
|---|---|---|
| `mobi-api` | `apps/api` | Other (settings come from `apps/api/vercel.json`) |
| `mobi-web` | `apps/web` | Next.js |
| `mobi-admin` | `apps/admin` | Next.js |

Leave the build and install commands at their defaults. Vercel detects the npm workspace and installs from the repo root. Node.js version: 22.x (Project → Settings → General).

## 1. API project (`apps/api`), deploy this first
Environment variables (Production):

| Name | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string (the demo database) |
| `JWT_SECRET` | 64 random characters, e.g. the output of `openssl rand -hex 32` |
| `DEMO_MODE` | `true` |
| `CORS_ORIGINS` | `https://mobi-web.vercel.app,https://mobi-admin.vercel.app,https://mobi-web-*.vercel.app,https://mobi-admin-*.vercel.app` (use your real project domains) |
| `TRUST_PROXY` | `1` |

Deploy, then open `https://<api-domain>/health`. It should return `{"ok":true,...}`.
The function region is Singapore (`sin1`), next to the Neon database.

## 2. Storefront project (`apps/web`)

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<api-domain>/api` |
| `NEXT_PUBLIC_SITE_URL` | `https://<web-domain>` |
| `NEXT_PUBLIC_DEMO_MODE` | `true` (shows the "demo store" banner and demo login; blocks search-engine indexing) |

## 3. Admin project (`apps/admin`)

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<api-domain>/api` |
| `NEXT_PUBLIC_DEMO_MODE` | `true` |

`NEXT_PUBLIC_*` values are fixed at build time. **Redeploy** after changing them.
If a domain changes, update `CORS_ORIGINS` on the API and redeploy it too.

## Demo logins (share with the client)
- Storefront customer: `8888888888` / `Customer@123`
- Admin panel: `9999999999` / `Admin@123`
- New registrations work: the OTP is displayed on the screen.

## Resetting demo data
From a machine with `apps/api/.env` pointing at the demo DB: `npm run db:seed`. It is idempotent and safe to re-run.

## Before turning the demo into the real store
Set `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE` to false, use a separate production database, change both demo passwords, and add an SMS provider and Razorpay keys. Full list: `DEPLOYMENT_CHECKLIST.md`.
