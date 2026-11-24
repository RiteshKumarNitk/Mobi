import { defineRoute } from "@/lib/route";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError, BadRequest, Conflict, Forbidden, NotFound, Unauthorized } from "../lib/errors";
import { verifyToken } from "../lib/jwt";
import { consumeRefreshToken, issueTokens, revokeUserTokens } from "../lib/tokens";
import { OTP_TTL_SECONDS, sendOtp, verifyOtp } from "../lib/otp";
import { publicUser } from "../lib/helpers";
import { authRequired } from "../lib/auth";
import { validate } from "../lib/validate";
import { rateLimit } from "../lib/rateLimit";
import { sendEmail } from "../lib/mailer";
import { env } from "../lib/env";
import { checkPassword, hashPassword, isDemoPassword, passwordPolicyError } from "../lib/passwords";

const phoneSchema = z.string().regex(/^[0-9]{10,15}$/, "Enter a valid phone number");
const newPasswordSchema = z.string().superRefine((pw, ctx) => {
  const err = passwordPolicyError(pw, { forbidDemo: env.isProd && !env.demoMode });
  if (err) ctx.addIssue({ code: z.ZodIssueCode.custom, message: err });
});

const registerSchema = z.object({
  phone: phoneSchema,
  password: newPasswordSchema,
  name: z.string().trim().min(2, "Name is required").max(100),
  email: z.string().email().max(200).optional().or(z.literal("")),
  shopName: z.string().max(200).optional(),
  gstNumber: z.string().max(20).optional(),
});

const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1).max(128),
});

// Compared against when the phone is unknown, so login timing does not reveal which numbers are registered.
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.5G0aV9E3O1s3Wc3vZ2s0sQzPq3e2";

// POST /api/auth/register - create account, then OTP verifies the phone
export const postRegister = defineRoute(
  validate(registerSchema),
  rateLimit({ max: 10, keyFrom: (req: any) => req.body?.phone }),
  async (req, res) => {
    const { phone, password, name, email, shopName, gstNumber } = req.body;
    const [first, ...rest] = name.trim().split(/\s+/);
    const profile = {
      passwordHash: await hashPassword(password),
      firstName: first,
      lastName: rest.join(" ") || null,
      email: email || null,
      shopName: shopName || null,
      gstNumber: gstNumber || null,
    };
    const existing = await prisma.user.findUnique({ where: { phone } });
    let user;
    if (existing) {
      // A verified number is taken. An *unverified* registration proves nothing about
      // ownership, so the real owner may re-register over it (prevents number squatting).
      if (existing.phoneVerified || existing.role !== "customer") {
        throw Conflict("An account with this phone number already exists. Please login.");
      }
      user = await prisma.user.update({ where: { id: existing.id }, data: profile });
    } else {
      user = await prisma.user.create({
        data: { phone, ...profile, phoneVerified: false, status: "pending", settings: { create: {} } },
      });
    }
    const debugCode = await sendOtp(phone, "register");
    return res.json({
      success: true,
      data: { user: publicUser(user), otpSent: true, expiresIn: OTP_TTL_SECONDS, debugCode: debugCode ?? null, message: "OTP sent to your phone. Verify to activate your account." },
    });
  }
);

// POST /api/auth/login
export const postLogin = defineRoute(
  validate(loginSchema),
  rateLimit({ max: 10, keyFrom: (req: any) => req.body?.phone }),
  rateLimit({ max: 30 }),
  async (req, res) => {
    const { phone, password } = req.body;
    const user = await prisma.user.findUnique({ where: { phone } });
    const ok = await checkPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw Unauthorized("Invalid phone number or password");
    if (env.isProd && !env.demoMode && isDemoPassword(password)) {
      throw new ApiError(403, "This account uses a publicly known demo password and is locked. Reset the password to continue.", "PASSWORD_RESET_REQUIRED");
    }
    if (user.status === "inactive") throw Forbidden("Your account has been deactivated. Contact support.");
    if (!user.phoneVerified) {
      // The client requests the OTP itself via POST /api/otp/send (purpose "register").
      throw new ApiError(403, "Phone not verified. Verify your number with an OTP to continue.", "OTP_REQUIRED");
    }
    if (user.status === "pending") throw new ApiError(403, "Your account is pending approval.", "PENDING");
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await issueTokens(user.id);
    return res.json({ success: true, data: { user: publicUser(user), ...tokens } });
  }
);

// POST /api/auth/refresh - rotate: the presented refresh token is consumed and a new pair issued
export const postRefresh = defineRoute(
  rateLimit({ max: 30 }),
  async (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken || typeof refreshToken !== "string") throw Unauthorized("Refresh token required");
    let payload;
    try {
      payload = verifyToken(refreshToken);
    } catch {
      throw Unauthorized("Invalid refresh token");
    }
    if (payload.type !== "refresh") throw Unauthorized("Invalid token type");
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken }, include: { user: { select: { status: true } } } });
    if (!stored || stored.expiresAt < new Date()) throw Unauthorized("Refresh token expired or revoked");
    if (stored.revoked || !(await consumeRefreshToken(stored.id, stored.userId))) {
      if (stored.revoked) await revokeUserTokens(stored.userId); // replay of a used token
      throw Unauthorized("Refresh token expired or revoked");
    }
    if (stored.user.status !== "active") throw Unauthorized("Your account is not active");
    const tokens = await issueTokens(stored.userId);
    return res.json({ success: true, data: tokens });
  }
);

// POST /api/auth/logout - revokes every refresh token of the user (all devices)
export const postLogout = defineRoute(
  authRequired,
  async (req, res) => {
    await revokeUserTokens(req.user!.id);
    return res.json({ success: true, data: { message: "Logged out" } });
  }
);

// GET /api/auth/me
export const getMe = defineRoute(
  authRequired,
  async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { settings: true, addresses: { orderBy: { isDefault: "desc" } } },
    });
    if (!user) throw NotFound("User not found");
    return res.json({ success: true, data: { user: publicUser(user), settings: user.settings, addresses: user.addresses } });
  }
);

// POST /api/auth/change-password - signed-in user changes their own password
export const postChangePassword = defineRoute(
  authRequired,
  rateLimit({ max: 10 }),
  validate(z.object({ currentPassword: z.string().min(1).max(128), newPassword: newPasswordSchema })),
  async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await checkPassword(req.body.currentPassword, user.passwordHash))) throw BadRequest("Current password is incorrect", "WRONG_PASSWORD");
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(req.body.newPassword) } });
    await revokeUserTokens(user.id);
    const tokens = await issueTokens(user.id);
    return res.json({ success: true, data: { message: "Password changed. Other devices have been signed out.", ...tokens } });
  }
);

// POST /api/auth/forgot-password - sends a password-reset OTP.
// The response is identical whether or not the number is registered (no account enumeration).
export const postForgotPassword = defineRoute(
  validate(z.object({ phone: phoneSchema })),
  rateLimit({ max: 5, keyFrom: (req: any) => req.body?.phone }),
  async (req, res) => {
    const { phone } = req.body;
    const user = await prisma.user.findUnique({ where: { phone } });
    const debugCode = user && user.status !== "inactive" ? await sendOtp(phone, "password_reset") : undefined;
    return res.json({
      success: true,
      data: { otpSent: true, expiresIn: OTP_TTL_SECONDS, debugCode: debugCode ?? null, message: "If an account exists for this number, an OTP has been sent." },
    });
  }
);

// POST /api/auth/reset-password
export const postResetPassword = defineRoute(
  validate(z.object({ phone: phoneSchema, code: z.string().regex(/^[0-9]{6}$/, "OTP must be 6 digits"), newPassword: newPasswordSchema })),
  rateLimit({ max: 10, keyFrom: (req: any) => req.body?.phone }),
  async (req, res) => {
    const { phone, code, newPassword } = req.body;
    await verifyOtp(phone, "password_reset", code);
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) throw BadRequest("Invalid OTP", "OTP_INVALID");
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
    await revokeUserTokens(user.id);
    if (user.email) {
      await sendEmail({
        to: user.email,
        subject: "Your password was changed",
        html: `<p>Your Baba Communication account password was changed successfully.</p>`,
      });
    }
    return res.json({ success: true, data: { message: "Password updated. Please login with your new password." } });
  }
);

export { phoneSchema };
