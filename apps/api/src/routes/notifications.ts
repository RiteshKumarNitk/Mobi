import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncH } from "../lib/async";
import { NotFound } from "../lib/errors";
import { paginate } from "../lib/helpers";
import { authRequired } from "../middleware/auth";

export const notificationsRouter = Router();

notificationsRouter.use(authRequired);

// GET /api/notifications
notificationsRouter.get(
  "/",
  asyncH(async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const where: any = { userId: (req as any).user.id };
    if (req.query.unreadOnly === "true") where.isRead = false;
    const [total, items, unread] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.notification.count({ where: { userId: (req as any).user.id, isRead: false } }),
    ]);
    res.json({ success: true, data: { items, total, unread, page, pageSize, pages: Math.ceil(total / pageSize) } });
  })
);

// PUT /api/notifications/:id/read
notificationsRouter.put(
  "/:id/read",
  asyncH(async (req, res) => {
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: (req as any).user.id },
    });
    if (!notification) throw NotFound("Notification not found");
    await prisma.notification.update({ where: { id: notification.id }, data: { isRead: true } });
    res.json({ success: true, data: { message: "Marked as read" } });
  })
);

// PUT /api/notifications/mark-all-read
notificationsRouter.put(
  "/mark-all-read",
  asyncH(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: (req as any).user.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ success: true, data: { message: "All notifications marked as read" } });
  })
);
