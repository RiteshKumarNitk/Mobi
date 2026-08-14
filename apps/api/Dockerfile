# Baba Communication API — production image
# Build: docker build -f apps/api/Dockerfile -t baba-api .
FROM node:20-slim AS base
WORKDIR /app
# Prisma requires openssl at runtime
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---- deps: install the whole workspace (monorepo) ----
FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
RUN npm ci

# ---- builder: generate Prisma client + compile ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
  && npm run build -w @baba/api

# ---- runner: runtime deps + compiled output ----
FROM base AS runner
ENV NODE_ENV=production \
    PORT=4000 \
    OTP_DEBUG=false
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
