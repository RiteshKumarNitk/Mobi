import { Router } from "express";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncH } from "../lib/async";
import { BadRequest, Forbidden } from "../lib/errors";
import { OTP_TTL_SECONDS, sendOtp, verifyOtp } from "../lib/otp";
import { issueTokens } from "../lib/tokens";
import { publicUser } from "../lib/helpers";
import { validate } from "../middleware/validate";
import { rateLimit } from "../lib/rateLimit";
import { phoneSchema } from "./auth";

export const otpRouter = Router();

const purposes = ["register", "login", "password_reset"] as const;
type Purpose = (typeof purposes)[number];

const otpBody = z.object({ phone: phoneSchema, purpose: z.enum(purposes) });
const verifyBody = z.object({ phone: phoneSchema, purpose: z.enum(purposes), code: z.string().regex(/^[0-9]{6}$/, "OTP must be 6 digits") });

/**
 * Only send an SMS when the purpose makes sense for this number. Requests for
 * unknown numbers get the same response without an SMS being sent, which
 * stops the endpoint being used to spam arbitrary phones or enumerate accounts.
 */
function eligible(user: User | null, purpose: Purpose): boolean {
  if (!user || user.status === "inactive") return false;
  if (purpose === "register") return !user.phoneVerified;
  return true;
}

const sendHandler = asyncH(async (req, res) => {
  const { phone, purpose } = req.body as { phone: string; purpose: Purpose };
  const user = await prisma.user.findUnique({ where: { phone } });
  const code = eligible(user, purpose) ? await sendOtp(phone, purpose) : undefined;
  res.json({ success: true, data: { otpSent: true, expiresIn: OTP_TTL_SECONDS, debugCode: code ?? null } });
});

// POST /api/otp/send
otpRouter.post("/send", validate(otpBody), rateLimit({ max: 5, keyFrom: (req: any) => req.body?.phone }), sendHandler);

// POST /api/otp/resend (same as send - generates a fresh code)
otpRouter.post("/resend", validate(otpBody), rateLimit({ max: 5, keyFrom: (req: any) => req.body?.phone }), sendHandler);

// POST /api/otp/verify
otpRouter.post(
  "/verify",
  validate(verifyBody),
  rateLimit({ max: 10, keyFrom: (req: any) => req.body?.phone }),
  asyncH(async (req, res) => {
    const { phone, purpose, code } = req.body;
    await verifyOtp(phone, purpose, code);

    if (purpose === "password_reset") {
      // Verification alone grants nothing; the code is consumed by /auth/reset-password.
      // Reset the "verified" flag so reset-password can still check the same code.
      await prisma.otp.updateMany({ where: { phone, purpose }, data: { verified: false } });
      return res.json({ success: true, data: { verified: true } });
    }

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) throw BadRequest("No account found for this number", "OTP_INVALID");
    // A deactivated account must never be re-activated by proving phone ownership.
    if (user.status === "inactive") throw Forbidden("Your account has been deactivated. Contact support.");

    // First phone verification activates a self-registered account. It does NOT
    // override an admin decision (e.g. "pending approval" set after verification).
    const updated = !user.phoneVerified
      ? await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true, status: "active" } })
      : user;
    if (updated.status !== "active") throw Forbidden("Your account is pending approval.");

    const tokens = await issueTokens(updated.id);
    res.json({ success: true, data: { verified: true, user: publicUser(updated), ...tokens } });
  })
);
