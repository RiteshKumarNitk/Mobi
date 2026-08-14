import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncH } from "../lib/async";
import { ApiError, BadRequest, Conflict, Forbidden, NotFound, Unauthorized } from "../lib/errors";
import { verifyToken } from "../lib/jwt";
import { issueTokens, revokeUserTokens } from "../lib/tokens";
import { sendOtp, verifyOtp } from "../lib/otp";
import { publicUser } from "../lib/helpers";
import { authRequired } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { rateLimit } from "../lib/rateLimit";
import { sendEmail } from "../lib/mailer";

export const authRouter = Router();

const phoneSchema = z.string().regex(/^[0-9]{10,15}$/, "Enter a valid phone number");

const registerSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(2, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  shopName: z.string().optional(),
  gstNumber: z.string().optional(),
});

const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1),
});

// POST /api/auth/register - create account, then OTP verifies the phone
authRouter.post(
  "/register",
  validate(registerSchema),
  rateLimit({ max: 10, keyFrom: (req: any) => req.body?.phone }),
  asyncH(async (req, res) => {
    const { phone, password, name, email, shopName, gstNumber } = req.body;
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) throw Conflict("An account with this phone number already exists. Please login.");
    const [first, ...rest] = name.trim().split(/\s+/);
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        phone,
        passwordHash,
        firstName: first,
        lastName: rest.join(" ") || null,
        email: email || null,
        shopName: shopName || null,
        gstNumber: gstNumber || null,
        phoneVerified: false,
        settings: { create: {} },
      },
    });
    const debugCode = await sendOtp(phone, "register");
    res.json({
      success: true,
      data: { user: publicUser(user), otpSent: true, expiresIn: 300, debugCode: debugCode ?? null, message: "OTP sent to your phone. Verify to activate your account." },
    });
  })
);

// POST /api/auth/login
authRouter.post(
  "/login",
  validate(loginSchema),
  rateLimit({ max: 20 }),
  asyncH(async (req, res) => {
    const { phone, password } = req.body;
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw Unauthorized("Invalid phone number or password");
    }
    if (user.status === "inactive") throw Forbidden("Your account has been deactivated. Contact support.");
    if (user.status === "pending") throw new ApiError(403, "Your account is pending approval.", "PENDING");
    if (!user.phoneVerified) {
      await sendOtp(phone, "login");
      throw new ApiError(403, "Phone not verified. OTP sent to your number.", "OTP_REQUIRED");
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await issueTokens(user.id);
    res.json({ success: true, data: { user: publicUser(user), ...tokens } });
  })
);

// POST /api/auth/refresh
authRouter.post(
  "/refresh",
  asyncH(async (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken) throw Unauthorized("Refresh token required");
    let payload;
    try {
      payload = verifyToken(refreshToken);
    } catch {
      throw Unauthorized("Invalid refresh token");
    }
    if (payload.type !== "refresh") throw Unauthorized("Invalid token type");
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw Unauthorized("Refresh token expired or revoked");
    }
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
    const tokens = await issueTokens(stored.userId);
    res.json({ success: true, data: tokens });
  })
);

// POST /api/auth/logout
authRouter.post(
  "/logout",
  authRequired,
  asyncH(async (req, res) => {
    await revokeUserTokens((req as any).user.id);
    res.json({ success: true, data: { message: "Logged out" } });
  })
);

// GET /api/auth/me
authRouter.get(
  "/me",
  authRequired,
  asyncH(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: (req as any).user.id },
      include: { settings: true, addresses: { orderBy: { isDefault: "desc" } } },
    });
    if (!user) throw NotFound("User not found");
    res.json({ success: true, data: { user: publicUser(user), settings: user.settings, addresses: user.addresses } });
  })
);

// POST /api/auth/forgot-password - sends password-reset OTP
authRouter.post(
  "/forgot-password",
  validate(z.object({ phone: phoneSchema })),
  rateLimit({ max: 10, keyFrom: (req: any) => req.body?.phone }),
  asyncH(async (req, res) => {
    const { phone } = req.body;
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) throw NotFound("No account found with this phone number");
    await sendOtp(phone, "password_reset");
    res.json({ success: true, data: { otpSent: true, expiresIn: 300 } });
  })
);

// POST /api/auth/reset-password
authRouter.post(
  "/reset-password",
  validate(z.object({ phone: phoneSchema, code: z.string().length(6), newPassword: z.string().min(6) })),
  asyncH(async (req, res) => {
    const { phone, code, newPassword } = req.body;
    await verifyOtp(phone, "password_reset", code);
    const user = await prisma.user.findUniqueOrThrow({ where: { phone } });
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
    await revokeUserTokens(user.id);
    await sendEmail({
      to: user.email ?? "",
      subject: "Your password was changed",
      html: `<p>Hi ${user.firstName ?? "there"},</p><p>Your Baba Communication account password was changed successfully.</p>`,
    });
    res.json({ success: true, data: { message: "Password updated. Please login with your new password." } });
  })
);

// POST /api/auth/verify-otp - convenience alias for /api/otp/verify
export { phoneSchema };
