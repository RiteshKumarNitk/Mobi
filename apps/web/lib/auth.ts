import type { ApiRequest } from "./route";
import { verifyToken } from "./jwt";
import { Unauthorized, Forbidden } from "./errors";
import { prisma } from "./prisma";

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

function bearer(req: ApiRequest): string | null {
  const header = req.headers.get("authorization");
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


export async function authRequired(req: ApiRequest) {
  if (req.user) return;
  const token = bearer(req);
  if (!token) throw Unauthorized();
  req.user = await resolveUser(token);
}

export async function optionalAuth(req: ApiRequest) {
  const token = bearer(req);
  if (token) req.user = await resolveUser(token);
}

export async function adminRequired(req: ApiRequest) {
  await authRequired(req);
  if (!isAdminRole(req.user!.role)) throw Forbidden();
}

export function can(permission: string) {
  return async (req: ApiRequest) => {
    await adminRequired(req);
    const permissions = PERMISSIONS[req.user!.role];
    if (!permissions?.includes("*") && !permissions?.includes(permission)) {
      throw Forbidden("Missing permission: " + permission);
    }
  };
}

export function requireRole(...roles: string[]) {
  return async (req: ApiRequest) => {
    await adminRequired(req);
    if (!roles.includes(req.user!.role)) throw Forbidden("This action is restricted to administrators");
  };
}

export const isAdminRole = (role: string) => ADMIN_ROLES.includes(role);
