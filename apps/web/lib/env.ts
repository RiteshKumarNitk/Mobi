function bool(value: string | undefined, fallback: boolean): boolean {
  return value ? value.trim().toLowerCase() === "true" : fallback;
}

const isProd = process.env.NODE_ENV === "production";

/**
 * DEMO_MODE=true — for a public client-review deployment running on demo data.
 * Allows the published demo logins and shows OTPs on screen (no SMS gateway).
 * Payments stay disabled (Cash on Delivery only). Never enable on a live store.
 */
const demoMode = (process.env.DEMO_MODE ?? "").toLowerCase() === "true";

export const DEFAULT_JWT_SECRET = "insecure-dev-secret-change-me";
/** Values copied from .env.example / docs that must never be used for real. */
const KNOWN_PLACEHOLDER_SECRETS = [DEFAULT_JWT_SECRET, "change-me-to-a-long-random-string", "changeme", "secret"];

export const env = {
  jwtSecret: process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1h",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "30d",
  // Debug OTPs are hard-disabled in production, whatever the env says.
  otpDebug: demoMode ? true : isProd ? false : bool(process.env.OTP_DEBUG, true),
  demoMode,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  /** Mock payments are a dev convenience and are NEVER available in production. */
  allowMockPayments: !isProd && bool(process.env.ALLOW_MOCK_PAYMENTS, true),
  apiDocsEnabled: bool(process.env.API_DOCS_ENABLED, !isProd),
  isProd,
};

/**
 * Validate configuration that must be correct before the API serves traffic.
 * Returns a list of fatal problems (empty = OK). Called on boot in index.ts.
 */
export function productionConfigErrors(e = env): string[] {
  if (!e.isProd) return [];
  const errors: string[] = [];
  if (!process.env.DATABASE_URL) errors.push("DATABASE_URL is not set.");
  if (KNOWN_PLACEHOLDER_SECRETS.includes(e.jwtSecret) || e.jwtSecret.length < 32) {
    errors.push("JWT_SECRET must be a random string of at least 32 characters (e.g. `openssl rand -hex 32`).");
  }
  if (Boolean(e.razorpayKeyId) !== Boolean(e.razorpayKeySecret)) {
    errors.push("Set both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, or neither (online payments disabled).");
  }
  return errors;
}
