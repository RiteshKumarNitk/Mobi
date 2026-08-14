import crypto from "crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { apiRouter } from "./routes";
import { ApiError } from "./lib/errors";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";

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
