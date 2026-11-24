/**
 * Vercel serverless entry: the whole Express API runs as one function.
 * vercel.json rewrites every path (/health, /api/...) to this file.
 * Local / Docker hosting keeps using src/index.ts (app.listen).
 */
import type { IncomingMessage, ServerResponse } from "http";
import { createApp } from "../src/app";
import { productionConfigErrors, productionConfigWarnings } from "../src/lib/env";
import { logger } from "../src/lib/logger";

const configErrors = productionConfigErrors();
for (const message of configErrors) logger.error("config_error", { message });
for (const message of productionConfigWarnings()) logger.warn("config_warning", { message });

let app: any;
let initError: Error | null = null;
try {
  app = createApp();
} catch (err: any) {
  initError = err;
  logger.error("app_creation_error", { message: err?.message, stack: err?.stack });
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Always handle CORS headers for preflight requests and error responses so browsers don't block with CORS errors
  const origin = (req.headers.origin as string) || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Request-Id");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (initError) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, error: { code: "SERVER_INIT_ERROR", message: initError.message } }));
    return;
  }

  if (configErrors.length) {
    // Same rule as src/index.ts: never serve traffic with insecure configuration.
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, error: { code: "MISCONFIGURED", message: "API is not configured. Check the deployment logs.", details: configErrors } }));
    return;
  }
  return (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
