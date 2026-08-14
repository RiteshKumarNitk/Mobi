import type { Request } from "express";
import { prisma } from "./prisma";

export async function logActivity(
  req: Request,
  action: string,
  entityType?: string,
  entityId?: string,
  extra: { oldData?: unknown; newData?: unknown } = {}
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        userId: (req as any).user?.id ?? undefined,
        action,
        entityType,
        entityId,
        oldData: extra.oldData as any ?? undefined,
        newData: extra.newData as any ?? undefined,
        ipAddress: req.ip,
        userAgent: (req.headers["user-agent"] ?? "").slice(0, 300) || undefined,
      },
    });
  } catch {
    // Logging must never break the request.
  }
}
