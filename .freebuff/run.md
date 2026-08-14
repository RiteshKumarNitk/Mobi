# Baba Communication — Preview Run Doc

This thread's workspace IS the main checkout (`C:\Users\RiteshKumar\Documents\github_Ritesh\Mobi`),
so all artifacts already exist in-place; nothing needs copying from another checkout.

## 1. Reproduce the uncommitted artifacts

- **Env files** (already present, do not commit):
  - `apps/api/.env` — API config (Postgres/Neon `DATABASE_URL`, `PORT=4000`, `OTP_DEBUG=true`, mock Razorpay)
  - `apps/web/.env.local` — `NEXT_PUBLIC_API_URL=http://localhost:4000/api`
  - `apps/admin/.env.local` — `NEXT_PUBLIC_API_URL=http://localhost:4000/api`
  - A fresh checkout recreates these from the `.env.example` files (set `DATABASE_URL` to a Neon/Postgres URL).
- **Dependencies**: `npm install` at the repo root (npm workspaces install all three apps).
- **Database** (Neon PostgreSQL): `npm run db:push` then `npm run db:seed`
  (schema provider is `postgresql`; creates the demo catalog + admin/customer accounts).

## 2. Run the servers

| Service | Command (repo root) | URL |
|---|---|---|
| REST API | `npm run dev:api` | http://localhost:4000 (health: `/health`) |
| Customer website (preview) | `npm run dev:web` | http://localhost:3000 |
| Admin panel | `npm run dev:admin` | http://localhost:3001 |

Detached start (Windows, PowerShell), one per service — stdout and stderr MUST go to different files:

```powershell
powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev:api' -RedirectStandardOutput '.freebuff\api.log' -RedirectStandardError '.freebuff\api.log.err' -WindowStyle Hidden -PassThru).Id"
powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev:web' -RedirectStandardOutput '.freebuff\preview-a498f536-6fab-4a91-9f0f-e46a76f8eea4.log' -RedirectStandardError '.freebuff\preview-a498f536-6fab-4a91-9f0f-e46a76f8eea4.log.err' -WindowStyle Hidden -PassThru).Id"
```

## 3. Verify / test

- **API test suite** (Vitest + Supertest against the live DB; self-cleaning): `npm test` (repo root) or `cd apps/api && npx vitest run`. Covers auth/OTP, admin access gates, case-insensitive search, bulk (box) pricing at cart + order time, the order status state machine, returns → approve → refund, and coupon math.
- **Smoke test** (requires the API running): `bash apps/api/scripts/smoke.sh`.
- **Typecheck**: `npm run typecheck` (repo root).

## 4. Notes

- **Caching**: catalog reads are served from an in-memory TTL cache (`X-Cache: HIT/MISS`);
  admin writes invalidate it automatically. `NODE_ENV=production` refuses to boot with the
  default JWT secret.
- **Logs**: the API emits structured JSON request logs (with `X-Request-Id`) — see
  `.freebuff/api.log` when debugging.

Demo accounts (seeded): admin `9999999999 / Admin@123` · customer `8888888888 / Customer@123`.
OTP flows work in dev without an SMS gateway (`OTP_DEBUG=true` returns the code in the response).
