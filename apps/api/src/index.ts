import { createApp } from "./app";
import { env, productionConfigErrors, productionConfigWarnings } from "./lib/env";
import { logger } from "./lib/logger";
import { paymentMode } from "./lib/razorpay";

// Production safety: refuse to boot with insecure or incomplete configuration.
const configErrors = productionConfigErrors();
if (configErrors.length) {
  for (const msg of configErrors) logger.error("config_error", { message: msg });
  logger.error("Refusing to start: fix the configuration errors above.");
  process.exit(1);
}
for (const msg of productionConfigWarnings()) logger.warn("config_warning", { message: msg });

const app = createApp();

app.listen(env.port, () => {
  logger.info(`Baba Communication API running on http://localhost:${env.port}`, {
    port: env.port,
    env: env.isProd ? "production" : "development",
    payments: paymentMode(),
    otpDebug: env.otpDebug,
  });
});
