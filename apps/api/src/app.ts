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

  app.set("trust proxy", true); // correct client IPs behind a reverse proxy

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: env.corsOrigins === "*" ? true : env.corsOrigins.split(",").map((s) => s.trim()),
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.text({ type: ["text/csv", "text/plain"], limit: "5mb" }));

  // Request ID + structured request logging
  app.use((req, res, next) => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    (req as any).requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    const start = Date.now();
    res.on("finish", () => {
      logger.info("request", {
        requestId,
        method: req.method,
        path: req.originalUrl,
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

  // OpenAPI docs (JSON spec + Swagger UI)
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
