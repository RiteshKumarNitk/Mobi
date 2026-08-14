import dotenv from "dotenv";

dotenv.config();

function int(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  // NOTE: some environments export PORT=0 (ephemeral); treat 0 as "unset"
  port: int(process.env.PORT, 4000) || 4000,
  corsOrigins: process.env.CORS_ORIGINS ?? "*",
  jwtSecret: process.env.JWT_SECRET ?? "insecure-dev-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1h",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "30d",
  otpDebug: (process.env.OTP_DEBUG ?? "true").toLowerCase() === "true",
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  isProd: process.env.NODE_ENV === "production",
};
