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

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (configErrors.length) {
    // Same rule as src/index.ts: never serve traffic with insecure configuration.
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, error: { code: "MISCONFIGURED", message: "API is not configured. Check the deployment logs.", details: configErrors } }));
    return;
  }
  return (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
