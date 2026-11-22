import dotenv from "dotenv";

dotenv.config();

function int(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  return value.trim().toLowerCase() === "true";
}

/**
 * Express "trust proxy" setting. Trusting every hop (`true`) lets any client
 * spoof X-Forwarded-For and dodge IP rate limits, so the default only trusts
 * loopback / private-network proxies (nginx, docker networks). Set
 * TRUST_PROXY=1 (hop count) or a CIDR list when deploying behind a CDN/LB.
 */
function trustProxy(value: string | undefined): boolean | number | string {
  if (!value) return "loopback, linklocal, uniquelocal";
  if (value === "true") return true;
  if (value === "false") return false;
  const n = Number(value);
  return Number.isInteger(n) ? n : value;
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
  // NOTE: some environments export PORT=0 (ephemeral); treat 0 as "unset"
  port: int(process.env.PORT, 4000) || 4000,
  corsOrigins: process.env.CORS_ORIGINS ?? (isProd ? "" : "*"),
  jwtSecret: process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1h",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "30d",
  // Debug OTPs are hard-disabled in production, whatever the env says.
  otpDebug: demoMode ? true : isProd ? false : bool(process.env.OTP_DEBUG, true),
  demoMode,
  otpDebugRequested: bool(process.env.OTP_DEBUG, false),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",
  /** Mock payments are a dev convenience and are NEVER available in production. */
  allowMockPayments: !isProd && bool(process.env.ALLOW_MOCK_PAYMENTS, true),
  apiDocsEnabled: bool(process.env.API_DOCS_ENABLED, !isProd),
  trustProxy: trustProxy(process.env.TRUST_PROXY),
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
  if (!e.corsOrigins || e.corsOrigins.trim() === "*") {
    errors.push("CORS_ORIGINS must list the storefront and admin origins explicitly in production (no '*').");
  }
  if (Boolean(e.razorpayKeyId) !== Boolean(e.razorpayKeySecret)) {
    errors.push("Set both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, or neither (online payments disabled).");
  }
  return errors;
}

/** Non-fatal production warnings, logged on boot. */
export function productionConfigWarnings(e = env): string[] {
  if (!e.isProd) return [];
  const warnings: string[] = [];
  if (e.demoMode) warnings.push("DEMO_MODE=true: demo logins allowed and OTPs shown on screen. For client review only — never for a live store.");
  if (e.otpDebugRequested && !e.demoMode) warnings.push("OTP_DEBUG=true is ignored in production; OTPs are never returned in responses.");
  if (!e.razorpayKeyId) warnings.push("Razorpay keys are not configured: online payments are DISABLED (COD only).");
  if (e.razorpayKeyId && !e.razorpayWebhookSecret) {
    warnings.push("RAZORPAY_WEBHOOK_SECRET is not set: payments captured after an interrupted checkout will not reconcile automatically.");
  }
  if (e.apiDocsEnabled) warnings.push("API_DOCS_ENABLED=true: Swagger UI is publicly reachable at /api/docs.");
  return warnings;
}
