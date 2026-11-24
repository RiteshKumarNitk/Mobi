# Baba Communication storefront (Next.js) — production image
# Build: docker build -f apps/web/Dockerfile -t baba-web .
FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# ---- deps ----
FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
COPY apps/web/prisma/schema.prisma apps/web/prisma/schema.prisma
RUN npm ci

# ---- builder ----
FROM base AS builder
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w @baba/web

# ---- runner ----
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/next.config.mjs ./apps/web/next.config.mjs
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@baba/web"]
