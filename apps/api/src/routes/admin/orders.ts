import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncH } from "../../lib/async";
import { BadRequest, NotFound } from "../../lib/errors";
import { paginate } from "../../lib/helpers";
import { adminRequired, can } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { logActivity } from "../../lib/activity";
import { buildInvoice } from "../../lib/invoice";

export const adminOrdersRouter = Router();

const ORDER_FLOW: Record<string, string[]> = {
  pending: ["processing", "cancelled"],
  processing: ["packed", "cancelled"],
  packed: ["shipped"],
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};

// GET /api/admin/orders
adminOrdersRouter.get(
  "/",
  adminRequired,
  asyncH(async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const { status, q, from, to } = req.query;
    const where: any = {};
    if (status) where.status = String(status);
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to) where.createdAt.lte = new Date(String(to));
    }
    if (q) {
      where.OR = [
        { orderNumber: { contains: String(q), mode: "insensitive" } },
        { user: { phone: { contains: String(q), mode: "insensitive" } } },
        { user: { firstName: { contains: String(q), mode: "insensitive" } } },
        { user: { shopName: { contains: String(q), mode: "insensitive" } } },
      ];
    }
    const [total, items] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        include: { user: true, _count: { select: { items: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    res.json({
      success: true,
      data: {
        items: items.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          paymentStatus: o.paymentStatus,
          paymentMethod: o.paymentMethod,
          totalAmount: o.totalAmount.toString(),
          createdAt: o.createdAt,
          customer: o.user ? [o.user.firstName, o.user.lastName].filter(Boolean).join(" ") || o.user.phone || o.user.shopName : "Guest",
          itemsCount: o._count.items,
        })),
        total,
        page,
        pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  })
);

// GET /api/admin/orders/:id
adminOrdersRouter.get(
  "/:id",
  adminRequired,
  asyncH(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        items: true,
        shippingAddress: true,
        user: true,
        statusHistory: { orderBy: { createdAt: "asc" } },
        payments: true,
        returnRequests: { include: { items: true } },
      },
    });
    if (!order) throw NotFound("Order not found");
    res.json({ success: true, data: order });
  })
);

// PUT /api/admin/orders/:id/status
adminOrdersRouter.put(
  "/:id/status",
  adminRequired,
  can("orders.update"),
  validate(z.object({ status: z.enum(["pending", "processing", "packed", "shipped", "delivered", "cancelled", "returned"]), notes: z.string().optional() })),
  asyncH(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!order) throw NotFound("Order not found");
    const next = req.body.status as string;
    if (!ORDER_FLOW[order.status]?.includes(next)) {
      throw BadRequest(`Cannot move order from "${order.status}" to "${next}"`);
    }
    const adminId = (req as any).user.id;

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: next as any, deliveredAt: next === "delivered" ? new Date() : order.deliveredAt },
      });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: next as any, notes: req.body.notes ?? null, updatedBy: adminId },
      });
      if (next === "cancelled") {
        for (const item of order.items) {
          if (item.productId) {
            await tx.product.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity } } });
          }
        }
        await tx.payment.updateMany({
          where: { orderId: order.id },
          data: { status: order.paymentStatus === "paid" ? "refunded" : "failed" },
        });
      }
      if (next === "delivered") {
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "paid" } });
        if (order.paymentMethod === "cod") {
          await tx.payment.updateMany({ where: { orderId: order.id }, data: { status: "paid", completedAt: new Date() } });
        }
      }
    });

    if (order.userId) {
      await prisma.notification.create({
        data: {
          userId: order.userId,
          type: "order",
          title: `Order ${next}`,
          message: `Your order ${order.orderNumber} is now ${next}${req.body.notes ? ` (${req.body.notes})` : ""}.`,
          data: { orderId: order.id },
        },
      });
    }
    await logActivity(req, "order.status", "order", order.id, { oldData: { status: order.status }, newData: { status: next } });
    res.json({ success: true, data: { message: `Order marked as ${next}` } });
  })
);

// POST /api/admin/orders/:id/cancel
adminOrdersRouter.post(
  "/:id/cancel",
  adminRequired,
  can("orders.update"),
  asyncH(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!order) throw NotFound("Order not found");
    if (!["pending", "processing"].includes(order.status)) {
      throw BadRequest(`Order cannot be cancelled in "${order.status}" status`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: "cancelled" } });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: "cancelled", notes: "Cancelled by admin", updatedBy: (req as any).user.id },
      });
      for (const item of order.items) {
        if (item.productId) {
          await tx.product.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity } } });
        }
      }
    });
    if (order.userId) {
      await prisma.notification.create({
        data: { userId: order.userId, type: "order", title: "Order cancelled", message: `Order ${order.orderNumber} was cancelled by the store.` },
      });
    }
    await logActivity(req, "order.cancel", "order", order.id);
    res.json({ success: true, data: { message: "Order cancelled" } });
  })
);

// GET /api/admin/orders/:id/invoice
adminOrdersRouter.get(
  "/:id/invoice",
  adminRequired,
  asyncH(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) throw NotFound("Order not found");
    const invoice = await buildInvoice(order.id);
    res.json({ success: true, data: invoice });
  })
);

// ---------------------------------------------------------------------------
// Returns (admin) - mounted at /api/admin/returns
// ---------------------------------------------------------------------------

export const adminReturnsRouter = Router();

adminReturnsRouter.use(adminRequired);

// GET /api/admin/returns
adminReturnsRouter.get(
  "/",
  asyncH(async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const { status } = req.query;
    const where: any = {};
    if (status) where.status = String(status);
    const [total, items] = await Promise.all([
      prisma.returnRequest.count({ where }),
      prisma.returnRequest.findMany({
        where,
        include: { order: { select: { orderNumber: true } }, user: true, _count: { select: { items: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    res.json({
      success: true,
      data: {
        items: items.map((r) => ({
          id: r.id,
          returnNumber: r.returnNumber,
          orderNumber: r.order.orderNumber,
          status: r.status,
          reason: r.reason,
          refundAmount: r.refundAmount ? Number(r.refundAmount).toString() : null,
          customer: [r.user.firstName, r.user.lastName].filter(Boolean).join(" ") || r.user.phone,
          itemsCount: r._count.items,
          createdAt: r.createdAt,
        })),
        total,
        page,
        pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  })
);

// GET /api/admin/returns/:id
adminReturnsRouter.get(
  "/:id",
  asyncH(async (req, res) => {
    const returnReq = await prisma.returnRequest.findUnique({
      where: { id: req.params.id },
      include: { order: { include: { items: true } }, items: { include: { orderItem: true } }, user: true },
    });
    if (!returnReq) throw NotFound("Return request not found");
    res.json({ success: true, data: returnReq });
  })
);

// PUT /api/admin/returns/:id/status
adminReturnsRouter.put(
  "/:id/status",
  can("orders.update"),
  validate(z.object({ status: z.enum(["pending", "approved", "rejected", "processed", "completed"]), adminNotes: z.string().optional() })),
  asyncH(async (req, res) => {
    const returnReq = await prisma.returnRequest.findUnique({ where: { id: req.params.id } });
    if (!returnReq) throw NotFound("Return request not found");
    const updated = await prisma.returnRequest.update({
      where: { id: returnReq.id },
      data: { status: req.body.status, adminNotes: req.body.adminNotes ?? null, processedAt: ["processed", "completed"].includes(req.body.status) ? new Date() : null },
    });
    if (returnReq.userId) {
      await prisma.notification.create({
        data: {
          userId: returnReq.userId,
          type: "return",
          title: `Return ${req.body.status}`,
          message: `Return ${returnReq.returnNumber} is now ${req.body.status}.${req.body.adminNotes ? ` Note: ${req.body.adminNotes}` : ""}`,
        },
      });
    }
    await logActivity(req, "return.status", "return", returnReq.id, { newData: { status: req.body.status } });
    res.json({ success: true, data: updated });
  })
);

// POST /api/admin/returns/:id/refund
adminReturnsRouter.post(
  "/:id/refund",
  can("orders.update"),
  validate(z.object({ refundAmount: z.number().positive().optional(), notes: z.string().optional() })),
  asyncH(async (req, res) => {
    const returnReq = await prisma.returnRequest.findUnique({ where: { id: req.params.id } });
    if (!returnReq) throw NotFound("Return request not found");
    const amount = req.body.refundAmount ?? Number(returnReq.refundAmount ?? returnReq.orderId ? await prisma.order.findUnique({ where: { id: returnReq.orderId } }).then((o) => o?.totalAmount ?? 0) : 0);
    const updated = await prisma.returnRequest.update({
      where: { id: returnReq.id },
      data: { refundAmount: amount, status: "processed", adminNotes: req.body.notes ?? returnReq.adminNotes, processedAt: new Date() },
    });
    await prisma.payment.updateMany({ where: { orderId: returnReq.orderId }, data: { status: "refunded" } });
    if (returnReq.userId) {
      await prisma.notification.create({
        data: {
          userId: returnReq.userId,
          type: "payment",
          title: "Refund processed",
          message: `Refund of ₹${Number(amount).toLocaleString("en-IN")} processed for return ${returnReq.returnNumber}.`,
        },
      });
    }
    await logActivity(req, "return.refund", "return", returnReq.id, { newData: { refundAmount: Number(amount) } });
    res.json({ success: true, data: updated });
  })
);
