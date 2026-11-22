import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncH } from "../../lib/async";
import type { OrderStatus } from "@prisma/client";
import { BadRequest, NotFound } from "../../lib/errors";
import { cancelOrder, transitionOrder } from "../../lib/orderOps";
import { paginate, round2 } from "../../lib/helpers";
import { adminRequired, can } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { logActivity } from "../../lib/activity";
import { buildInvoice } from "../../lib/invoice";

export const adminOrdersRouter = Router();

/** Allowed return-request transitions (refunds go through POST /:id/refund). */
const RETURN_FLOW: Record<string, string[]> = {
  pending: ["approved", "rejected"],
  approved: ["processed", "rejected"],
  processed: ["completed"],
  rejected: [],
  completed: [],
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
    const next = req.body.status as OrderStatus;
    const adminId = (req as any).user.id;
    // Validates the transition, applies it atomically (conditional on the current
    // status), restores stock on cancel, and only marks COD orders paid on delivery.
    await transitionOrder(order, next, { userId: adminId, note: req.body.notes ?? null });

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
    await cancelOrder(order, { userId: (req as any).user.id, note: "Cancelled by admin" });
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
  validate(z.object({ status: z.enum(["pending", "approved", "rejected", "processed", "completed"]), adminNotes: z.string().max(2000).optional() })),
  asyncH(async (req, res) => {
    const returnReq = await prisma.returnRequest.findUnique({ where: { id: req.params.id } });
    if (!returnReq) throw NotFound("Return request not found");
    const next = req.body.status as string;
    if (next === returnReq.status) {
      // Same status = notes-only update (used by the admin notes field).
      const updated = await prisma.returnRequest.update({ where: { id: returnReq.id }, data: { adminNotes: req.body.adminNotes ?? returnReq.adminNotes } });
      return res.json({ success: true, data: updated });
    }
    if (!RETURN_FLOW[returnReq.status]?.includes(next)) {
      throw BadRequest(`Cannot move return from "${returnReq.status}" to "${next}"`, "INVALID_TRANSITION");
    }
    if (next === "processed") throw BadRequest("Use the refund action to process a return", "USE_REFUND");
    const { count } = await prisma.returnRequest.updateMany({
      where: { id: returnReq.id, status: returnReq.status },
      data: { status: next as any, adminNotes: req.body.adminNotes ?? returnReq.adminNotes, processedAt: next === "completed" ? new Date() : returnReq.processedAt },
    });
    if (count !== 1) throw BadRequest("The return was updated by someone else. Refresh and try again.", "CONCURRENT_UPDATE");
    const updated = await prisma.returnRequest.findUniqueOrThrow({ where: { id: returnReq.id } });
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
  validate(z.object({ refundAmount: z.number().positive().max(10_000_000).optional(), notes: z.string().max(2000).optional() })),
  asyncH(async (req, res) => {
    const returnReq = await prisma.returnRequest.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { orderItem: true } }, order: true },
    });
    if (!returnReq) throw NotFound("Return request not found");
    if (returnReq.status !== "approved") throw BadRequest(`Only approved returns can be refunded (this one is "${returnReq.status}")`, "INVALID_TRANSITION");
    const order = returnReq.order;
    if (order.paymentStatus !== "paid") throw BadRequest("Nothing to refund: the order has not been paid", "NOT_PAID");

    // Default refund = value of the returned items at the price actually paid.
    const itemsValue = round2(returnReq.items.reduce((s, i) => s + Number(i.orderItem.price) * i.quantity, 0));
    const refundable = round2(Number(order.totalAmount) - Number(order.refundedAmount));
    const amount = round2(req.body.refundAmount ?? itemsValue);
    if (amount <= 0) throw BadRequest("Refund amount must be positive");
    if (amount > refundable) throw BadRequest(`Refund exceeds the refundable balance of ₹${refundable}`, "REFUND_EXCEEDS_BALANCE");

    const updated = await prisma.$transaction(async (tx) => {
      // Conditional on "approved": a double-submitted refund is applied once.
      const { count } = await tx.returnRequest.updateMany({
        where: { id: returnReq.id, status: "approved" },
        data: { refundAmount: amount, status: "processed", adminNotes: req.body.notes ?? returnReq.adminNotes, processedAt: new Date() },
      });
      if (count !== 1) throw BadRequest("This return was already processed", "CONCURRENT_UPDATE");
      const newRefunded = round2(Number(order.refundedAmount) + amount);
      const fully = newRefunded >= Number(order.totalAmount);
      await tx.order.update({
        where: { id: order.id },
        data: { refundedAmount: newRefunded, ...(fully ? { paymentStatus: "refunded" as const } : {}) },
      });
      const payment = await tx.payment.findFirst({ where: { orderId: order.id, status: "paid" } });
      if (payment) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { refundedAmount: Math.min(Number(payment.amount), Number(payment.refundedAmount) + amount), ...(fully ? { status: "refunded" as const } : {}) },
        });
      }
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: order.status, notes: `Refund of ₹${amount} recorded for return ${returnReq.returnNumber}`, updatedBy: (req as any).user.id },
      });
      return tx.returnRequest.findUniqueOrThrow({ where: { id: returnReq.id } });
    });
    if (returnReq.userId) {
      await prisma.notification.create({
        data: {
          userId: returnReq.userId,
          type: "payment",
          title: "Refund approved",
          message: `A refund of ₹${Number(amount).toLocaleString("en-IN")} has been approved for return ${returnReq.returnNumber}.`,
        },
      });
    }
    await logActivity(req, "return.refund", "return", returnReq.id, { newData: { refundAmount: Number(amount) } });
    // The refund is RECORDED here. Money movement (Razorpay refund / bank transfer for
    // COD) is done by the finance team — no gateway refund API call is made.
    res.json({ success: true, data: { ...updated, refundExecution: "manual" } });
  })
);
