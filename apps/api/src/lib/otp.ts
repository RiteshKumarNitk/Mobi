import crypto from "crypto";
import { prisma } from "./prisma";
import { env } from "./env";
import { BadRequest } from "./errors";
import { logger } from "./logger";
import { sendSms } from "./sms";
import type { OtpPurpose } from "@prisma/client";

export const OTP_TTL_SECONDS = 300; // 5 minutes
const MAX_ATTEMPTS = 5;

/** OTPs are stored hashed (bound to phone + purpose) so a DB read does not reveal live codes. */
function hashOtp(phone: string, purpose: OtpPurpose, code: string): string {
  return crypto.createHmac("sha256", env.jwtSecret).update(`${phone}:${purpose}:${code}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Generate, store and deliver an OTP. Returns the plain code ONLY when
 * OTP_DEBUG is active (never in production — see env.ts), so dev/test flows
 * work without an SMS gateway.
 */
export async function sendOtp(phone: string, purpose: OtpPurpose): Promise<string | undefined> {
  const code = String(crypto.randomInt(100000, 1000000));
  await prisma.$transaction([
    prisma.otp.deleteMany({ where: { phone, purpose } }),
    prisma.otp.create({
      data: { phone, purpose, code: hashOtp(phone, purpose, code), expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000) },
    }),
  ]);
  const delivery = await sendSms(phone, `${code} is your Baba Communication verification code. It expires in 5 minutes. Do not share it.`);
  if (!delivery.delivered) {
    // Never log the code itself outside debug mode.
    logger.warn("otp_not_delivered", { purpose, phoneSuffix: phone.slice(-4), reason: delivery.reason });
  }
  if (env.otpDebug) {
    logger.debug("otp_debug", { purpose, phoneSuffix: phone.slice(-4), code });
    return code;
  }
  return undefined;
}

export async function verifyOtp(phone: string, purpose: OtpPurpose, code: string): Promise<boolean> {
  const otp = await prisma.otp.findFirst({ where: { phone, purpose }, orderBy: { createdAt: "desc" } });
  if (!otp) throw BadRequest("No OTP found for this number. Request a new one.", "OTP_NOT_FOUND");
  if (otp.verified) throw BadRequest("This OTP has already been used.", "OTP_USED");
  if (otp.expiresAt < new Date()) throw BadRequest("OTP has expired. Request a new one.", "OTP_EXPIRED");
  if (otp.attempts >= MAX_ATTEMPTS) throw BadRequest("Too many wrong attempts. Request a new OTP.", "OTP_LIMIT");
  if (!safeEqual(otp.code, hashOtp(phone, purpose, code))) {
    await prisma.otp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw BadRequest("Incorrect OTP. Please try again.", "OTP_INVALID");
  }
  // Conditional update: two concurrent verifications of the same code cannot both succeed.
  const { count } = await prisma.otp.updateMany({ where: { id: otp.id, verified: false }, data: { verified: true } });
  if (count !== 1) throw BadRequest("This OTP has already been used.", "OTP_USED");
  return true;
}
