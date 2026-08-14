import { prisma } from "./prisma";
import { env } from "./env";
import { BadRequest } from "./errors";
import type { OtpPurpose } from "@prisma/client";

export const OTP_TTL_SECONDS = 300; // 5 minutes
const MAX_ATTEMPTS = 5;

export async function sendOtp(phone: string, purpose: OtpPurpose): Promise<string | undefined> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.otp.deleteMany({ where: { phone, purpose } });
  await prisma.otp.create({
    data: { phone, purpose, code, expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000) },
  });
  // TODO: plug in an SMS gateway (MSG91 / Twilio / WhatsApp Business API) here.
  console.log(`[OTP:${purpose}] ${phone} -> ${code}${env.otpDebug ? " (returned in response because OTP_DEBUG=true)" : ""}`);
  return env.otpDebug ? code : undefined;
}

export async function verifyOtp(phone: string, purpose: OtpPurpose, code: string): Promise<boolean> {
  const otp = await prisma.otp.findFirst({ where: { phone, purpose } });
  if (!otp) throw BadRequest("No OTP found for this number. Request a new one.", "OTP_NOT_FOUND");
  if (otp.verified) throw BadRequest("This OTP has already been used.", "OTP_USED");
  if (otp.expiresAt < new Date()) throw BadRequest("OTP has expired. Request a new one.", "OTP_EXPIRED");
  if (otp.attempts >= MAX_ATTEMPTS) throw BadRequest("Too many wrong attempts. Request a new OTP.", "OTP_LIMIT");
  if (otp.code !== code) {
    await prisma.otp.update({ where: { id: otp.id }, data: { attempts: otp.attempts + 1 } });
    throw BadRequest("Incorrect OTP. Please try again.", "OTP_INVALID");
  }
  await prisma.otp.update({ where: { id: otp.id }, data: { verified: true } });
  return true;
}
