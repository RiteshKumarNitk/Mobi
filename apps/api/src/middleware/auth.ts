import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt";
import { Unauthorized, Forbidden } from "../lib/errors";
import { prisma } from "../lib/prisma";

export interface AuthUser {
  id: string;
  role: string;
}

const ADMIN_ROLES = ["super_admin", "admin", "manager", "staff"];

const PERMISSIONS: Record<string, string[]> = {
  super_admin: ["*"],
  admin: ["*"],
  manager: ["orders.view", "orders.update", "inventory.view", "inventory.update", "customers.view", "products.view", "products.edit", "reports.view", "marketing.edit", "content.edit"],
  staff: ["products.view", "orders.view", "inventory.view", "customers.view"],
};

export function authRequired(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(Unauthorized());
  try {
    const payload = verifyToken(header.slice(7));
    (req as any).user = { id: payload.sub!, role: payload.role } as AuthUser;
    next();
  } catch {
    next(Unauthorized("Invalid or expired token"));
  }
}

export function adminRequired(req: Request, res: Response, next: NextFunction) {
  authRequired(req, res, (err?: any) => {
    if (err) return next(err);
    // Re-validate the role/status against the DB on every admin request so a
    // demoted, deactivated, or deleted admin loses access immediately instead
    // of riding out the JWT's remaining lifetime.
    void (async () => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: (req as any).user.id },
          select: { role: true, status: true },
        });
        if (!user || user.status !== "active" || !ADMIN_ROLES.includes(user.role)) {
          return next(Forbidden());
        }
        (req as any).user.role = user.role; // always use the fresh role
        next();
      } catch (e) {
        next(e);
      }
    })();
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

export const isAdminRole = (role: string) => ADMIN_ROLES.includes(role);
