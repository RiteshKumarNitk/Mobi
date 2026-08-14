import { createApp } from "./app";
import { env } from "./lib/env";
import { logger } from "./lib/logger";

// Production safety: never boot with the insecure default signing secret.
if (env.isProd && env.jwtSecret === "insecure-dev-secret-change-me") {
  logger.error("Refusing to start: set a strong JWT_SECRET before running in production.");
  process.exit(1);
}

const app = createApp();

app.listen(env.port, () => {
  logger.info(`Baba Communication API running on http://localhost:${env.port}`, {
    port: env.port,
    env: env.isProd ? "production" : "development",
    razorpay: env.razorpayKeyId ? "configured" : "mock-mode",
  });
});
