import crypto from "crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { apiRouter } from "./routes";
import { ApiError } from "./lib/errors";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { openapiSpec } from "./lib/openapi";
import { Prisma } from "@prisma/client";
import { razorpayWebhookHandler } from "./routes/payments";

const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Baba Communication API — Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; background: #f6f7f9; }
    .topbar { display: none; }
    #swagger-ui { max-width: 1460px; margin: 0 auto; padding: 16px; }
    .swagger-ui .info .title { font-size: 28px; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/docs.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      defaultModelsExpandDepth: 2,
      docExpansion: 'list',
    });
  </script>
</body>
</html>`;

export function createApp() {
  const app = express();
  const startedAt = Date.now();

  // Which proxies may set X-Forwarded-For (see env.ts). Never blindly `true`,
  // or clients can spoof their IP and bypass rate limits.
  app.set("trust proxy", env.trustProxy);
  app.disable("x-powered-by");
  // API responses are often personal (cart, orders, addresses). No ETag/304
  // revalidation and no storage in browser, CDN or proxy caches. Catalog reads
  // are cached server-side instead (lib/cache.ts).
  app.set("etag", false);
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
  // Entries may contain "*" as a wildcard inside a hostname (e.g.
  // https://mobi-*.vercel.app for Vercel preview URLs). A bare "*" allows all (dev only).
  const origins = env.corsOrigins
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean)
    .map((o) => (o.includes("*") ? new RegExp(`^${o.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9-]+")}$`, "i") : o));
  app.use(
    cors({
      // Auth uses Bearer tokens (no cookies), so credentialed CORS is not needed.
      origin: env.corsOrigins.trim() === "*" ? true : origins,
      credentials: false,
      exposedHeaders: ["X-Request-Id", "Retry-After"],
    })
  );

  // The Razorpay webhook needs the exact raw bytes for HMAC verification, so it
  // is mounted before the JSON body parser.
  app.post("/api/payments/razorpay/webhook", express.raw({ type: "*/*", limit: "1mb" }), (req, res, next) => {
    razorpayWebhookHandler(req, res).catch(next);
  });

  app.use(express.json({ limit: "1mb" }));
  app.use(express.text({ type: ["text/csv", "text/plain"], limit: "5mb" }));

  // Request ID + structured request logging
  app.use((req, res, next) => {
    const incoming = req.headers["x-request-id"];
    // Only echo well-formed client request ids (prevents log/header injection).
    const requestId = typeof incoming === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    (req as any).requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    const start = Date.now();
    res.on("finish", () => {
      logger.info("request", {
        requestId,
        method: req.method,
        path: req.originalUrl.split("?")[0], // query strings can carry personal data (search terms, phones)
        status: res.statusCode,
        durationMs: Date.now() - start,
        ip: req.ip,
        userAgent: (req.headers["user-agent"] ?? "").slice(0, 120),
      });
    });
    next();
  });

  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        ok: true,
        service: "baba-api",
        status: "healthy",
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        ts: Date.now(),
      });
    } catch {
      res.status(503).json({ ok: false, service: "baba-api", status: "degraded", ts: Date.now() });
    }
  });

  // OpenAPI docs (JSON spec + Swagger UI) — off in production unless API_DOCS_ENABLED=true
  if (env.apiDocsEnabled) {
    app.get("/api/docs.json", (_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.send(JSON.stringify(openapiSpec));
    });
    app.get("/api/docs", (_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(SWAGGER_UI_HTML);
    });
  }

  app.use("/api", apiRouter);

  // 404
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Endpoint not found" } });
  });

  // Error handler
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
    }
    // body-parser errors: malformed JSON (400) / body too large (413)
    const bodyErr = err as { type?: string };
    if (bodyErr?.type === "entity.parse.failed") {
      return res.status(400).json({ success: false, error: { code: "BAD_JSON", message: "Malformed JSON body" } });
    }
    if (bodyErr?.type === "entity.too.large") {
      return res.status(413).json({ success: false, error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" } });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Record not found" } });
      if (err.code === "P2002") return res.status(409).json({ success: false, error: { code: "CONFLICT", message: "A record with these details already exists" } });
      if (err.code === "P2003") return res.status(409).json({ success: false, error: { code: "IN_USE", message: "This record is referenced by other data and cannot be removed" } });
      if (err.code === "P2023") return res.status(400).json({ success: false, error: { code: "BAD_ID", message: "Malformed identifier" } });
    }
    if (err instanceof Prisma.PrismaClientValidationError) {
      return res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Invalid request parameters" } });
    }
    logger.error("unhandled_error", {
      requestId: (req as any).requestId,
      path: req.originalUrl,
      method: req.method,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return res.status(500).json({ success: false, error: { code: "INTERNAL", message: "Something went wrong" } });
  });

  return app;
}
