import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt";
import { Unauthorized, Forbidden } from "../lib/errors";
import { prisma } from "../lib/prisma";

export interface AuthUser {
  id: string;
  role: string;
}

const ADMIN_ROLES = ["super_admin", "admin", "manager", "staff"];
/** Roles allowed to manage system-level resources (settings, roles, logs, backups, customers). */
export const OWNER_ROLES = ["super_admin", "admin"];

const PERMISSIONS: Record<string, string[]> = {
  super_admin: ["*"],
  admin: ["*"],
  manager: ["orders.view", "orders.update", "inventory.view", "inventory.update", "customers.view", "products.view", "products.edit", "reports.view", "marketing.edit", "content.edit"],
  staff: ["products.view", "orders.view", "inventory.view", "customers.view"],
};

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

/**
 * Resolve the token to a *current* user. The JWT alone is not enough: a
 * deactivated, deleted or demoted account must lose access immediately rather
 * than when its access token expires, so role and status are re-read from the
 * DB (one primary-key lookup).
 */
async function resolveUser(token: string): Promise<AuthUser> {
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw Unauthorized("Invalid or expired token");
  }
  if (!payload.sub || payload.type === "refresh") throw Unauthorized("Invalid token");
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true, status: true } });
  if (!user) throw Unauthorized("Account not found");
  if (user.status !== "active") throw Unauthorized("Your account is not active");
  return { id: user.id, role: user.role };
}

export function authRequired(req: Request, _res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) return next(Unauthorized());
  resolveUser(token)
    .then((user) => {
      (req as any).user = user;
      next();
    })
    .catch(next);
}

/** Attach the user when a valid token is present; continue anonymously otherwise. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) return next();
  resolveUser(token)
    .then((user) => {
      (req as any).user = user;
      next();
    })
    // An expired/invalid token on an endpoint that works anonymously must still
    // be reported, so the client can refresh instead of silently using a guest cart.
    .catch(next);
}

export function adminRequired(req: Request, res: Response, next: NextFunction) {
  if ((req as any).user && ADMIN_ROLES.includes((req as any).user.role)) return next();
  authRequired(req, res, (err?: any) => {
    if (err) return next(err);
    if (!ADMIN_ROLES.includes((req as any).user.role)) return next(Forbidden());
    next();
  });
}

/** Require a named permission for staff/manager roles; admins always pass. */
export function can(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    adminRequired(req, res, (err?: any) => {
      if (err) return next(err);
      const role = (req as any).user.role as string;
      if (PERMISSIONS[role]?.includes("*") || PERMISSIONS[role]?.includes(permission)) return next();
      next(Forbidden(`Missing permission: ${permission}`));
    });
  };
}

/** Restrict to specific admin roles (e.g. settings/backups are owner-only). */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    adminRequired(req, res, (err?: any) => {
      if (err) return next(err);
      if (!roles.includes((req as any).user.role)) return next(Forbidden("This action is restricted to administrators"));
      next();
    });
  };
}

export const isAdminRole = (role: string) => ADMIN_ROLES.includes(role);
