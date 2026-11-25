# Deploying the client-review demo on Vercel

The whole demo is **one Vercel project**: the storefront (`apps/web`). It serves:

| Path | What |
|---|---|
| `/` | Customer website |
| `/admin` | Admin panel |
| `/api` | REST API (Next.js route handlers) |

The demo uses the seeded data, takes **no payments** (Cash on Delivery only), and sends **no SMS**: OTPs are shown on screen.

## Project settings
- Import the GitHub repo and set **Root Directory** to `apps/web`. The framework preset is **Next.js**.
- Do **not** use "Import multi-service project". Do not create projects for `apps/api`; the Express API is only for local/Docker use and is not needed on Vercel.
- Leave the build and install commands at their defaults (no overrides).
- Node.js version: 22.x (Project → Settings → General).

## Environment variables (Production)

| Name | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string (the demo database) |
| `JWT_SECRET` | 64+ random characters, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `DEMO_MODE` | `true` |
| `NEXT_PUBLIC_DEMO_MODE` | `true` (shows the "demo store" banner and demo logins; blocks search-engine indexing) |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-project>.vercel.app` |
| `CORS_ORIGINS` | the same `https://<your-project>.vercel.app` (the admin panel is same-origin, so nothing else is needed) |

`NEXT_PUBLIC_*` values are fixed at build time, so **redeploy** after changing them.
`NEXT_PUBLIC_API_URL` is no longer used. Delete it if it is still set.

After deploying, check:
- `https://<your-project>.vercel.app/api/health` returns `{"ok":true,...}`
- `https://<your-project>.vercel.app/admin` opens the admin login

## Demo logins (share with the client)
- Storefront customer (`/login`): `8888888888` / `Customer@123`
- Admin panel (`/admin`): `9999999999` / `Admin@123`
- New registrations work: the OTP is displayed on the screen.

## Resetting demo data
From a machine with `apps/api/.env` pointing at the demo DB: `npm run db:seed`. It is idempotent and safe to re-run.

## Before turning the demo into the real store
Set `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE` to false, use a separate production database, change both demo passwords, and add an SMS provider and Razorpay keys. Full list: `DEPLOYMENT_CHECKLIST.md`.
