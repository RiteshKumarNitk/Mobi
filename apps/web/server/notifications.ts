import { defineRoute } from "@/lib/route";
import { prisma } from "../lib/prisma";
import { NotFound } from "../lib/errors";
import { paginate } from "../lib/helpers";
import { authRequired } from "../lib/auth";

// GET /api/notifications
export const getNotifications = defineRoute(
  authRequired,
  async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const where: any = { userId: req.user!.id };
    if (req.query.unreadOnly === "true") where.isRead = false;
    const [total, items, unread] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.notification.count({ where: { userId: req.user!.id, isRead: false } }),
    ]);
    return res.json({ success: true, data: { items, total, unread, page, pageSize, pages: Math.ceil(total / pageSize) } });
  }
);

// PUT /api/notifications/:id/read
export const putIdRead = defineRoute(
  authRequired,
  async (req, res) => {
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!notification) throw NotFound("Notification not found");
    await prisma.notification.update({ where: { id: notification.id }, data: { isRead: true } });
    return res.json({ success: true, data: { message: "Marked as read" } });
  }
);

// PUT /api/notifications/mark-all-read
export const putMarkAllRead = defineRoute(
  authRequired,
  async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });
    return res.json({ success: true, data: { message: "All notifications marked as read" } });
  }
);
