import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncH } from "../lib/async";
import { NotFound } from "../lib/errors";
import { OTP_TTL_SECONDS, sendOtp, verifyOtp } from "../lib/otp";
import { issueTokens } from "../lib/tokens";
import { publicUser } from "../lib/helpers";
import { validate } from "../middleware/validate";
import { rateLimit } from "../lib/rateLimit";
import { phoneSchema } from "./auth";

export const otpRouter = Router();

const purposes = ["register", "login", "password_reset"] as const;

const otpBody = z.object({ phone: phoneSchema, purpose: z.enum(purposes) });
const verifyBody = z.object({ phone: phoneSchema, purpose: z.enum(purposes), code: z.string().length(6, "OTP must be 6 digits") });

// POST /api/otp/send
otpRouter.post(
  "/send",
  validate(otpBody),
  rateLimit({ max: 10, keyFrom: (req: any) => req.body?.phone }),
  asyncH(async (req, res) => {
    const { phone, purpose } = req.body;
    const code = await sendOtp(phone, purpose);
    res.json({ success: true, data: { otpSent: true, expiresIn: OTP_TTL_SECONDS, debugCode: code ?? null } });
  })
);

// POST /api/otp/resend (same as send - generates a fresh code)
otpRouter.post(
  "/resend",
  validate(otpBody),
  rateLimit({ max: 10, keyFrom: (req: any) => req.body?.phone }),
  asyncH(async (req, res) => {
    const { phone, purpose } = req.body;
    const code = await sendOtp(phone, purpose);
    res.json({ success: true, data: { otpSent: true, expiresIn: OTP_TTL_SECONDS, debugCode: code ?? null } });
  })
);

// POST /api/otp/verify
otpRouter.post(
  "/verify",
  validate(verifyBody),
  asyncH(async (req, res) => {
    const { phone, purpose, code } = req.body;
    await verifyOtp(phone, purpose, code);

    if (purpose === "password_reset") {
      return res.json({ success: true, data: { verified: true } });
    }

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) throw NotFound("No account found for this number");

    const activate = purpose === "register" || user.status === "pending" || !user.phoneVerified;
    const updated = activate
      ? await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true, status: "active" } })
      : user;

    const tokens = await issueTokens(updated.id);
    res.json({ success: true, data: { verified: true, user: publicUser(updated), ...tokens } });
  })
);
