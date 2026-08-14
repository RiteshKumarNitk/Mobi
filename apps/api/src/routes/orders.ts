import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncH } from "../lib/async";
import { BadRequest, Forbidden, NotFound } from "../lib/errors";
import { effectiveUnitPrice, genOrderNumber, paginate, round2 } from "../lib/helpers";
import { authRequired, isAdminRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { validateCouponForOrder } from "../lib/coupons";
import { shippingChargeFor } from "../lib/settings";
import { createRazorpayOrder } from "../lib/razorpay";
import { buildInvoice } from "../lib/invoice";
import { logActivity } from "../lib/activity";

export const ordersRouter = Router();

const createOrderSchema = z.object({
  addressId: z.string().uuid(),
  paymentMethod: z.enum(["razorpay", "cod"]),
  shippingMethod: z.string().optional(),
  couponCode: z.string().optional(),
  notes: z.string().optional(),
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1) }))
    .optional(),
});

const adminRoles = (role: string) => isAdminRole(role);

async function loadOrder(id: string, include: any = {}): Promise<any> {
  return prisma.order.findUnique({ where: { id }, include });
}

// GET /api/orders/track/:orderNumber - public guest tracking
ordersRouter.get(
  "/track/:orderNumber",
  asyncH(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { orderNumber: req.params.orderNumber },
      include: { statusHistory: { orderBy: { createdAt: "asc" } } },
    });
    if (!order) throw NotFound("Order not found");
    res.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt,
        deliveredAt: order.deliveredAt,
        timeline: order.statusHistory.map((h) => ({ status: h.status, notes: h.notes, at: h.createdAt })),
      },
    });
  })
);

// POST /api/orders/create
ordersRouter.post(
  "/create",
  authRequired,
  validate(createOrderSchema),
  asyncH(async (req, res) => {
    const userId = (req as any).user.id;
    const { addressId, paymentMethod, shippingMethod, couponCode, notes, items } = req.body;

    const address = await prisma.userAddress.findFirst({ where: { id: addressId, userId } });
    if (!address) throw NotFound("Shipping address not found");

    let lines: { productId: string; quantity: number }[];
    if (items && items.length) {
      lines = items;
    } else {
      const cartItems = await prisma.cartItem.findMany({
        where: { userId, isSavedForLater: false },
        include: { product: true },
      });
      if (!cartItems.length) throw BadRequest("Your cart is empty");
      lines = cartItems.map((c) => ({ productId: c.productId, quantity: c.quantity }));
    }

    const products = await prisma.product.findMany({
      where: { id: { in: lines.map((l) => l.productId) }, status: "active" },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    for (const line of lines) {
      const p = byId.get(line.productId);
      if (!p) throw BadRequest("Some products in your order are no longer available");
      if (p.stockQuantity < line.quantity) throw BadRequest(`Insufficient stock for "${p.name}". Only ${p.stockQuantity} left.`);
    }

    const subtotal = lines.reduce((s, l) => {
      const p = byId.get(l.productId)!;
      return s + effectiveUnitPrice(p, l.quantity) * l.quantity;
    }, 0);

    let coupon: any = null;
    let discount = 0;
    if (couponCode) {
      coupon = await prisma.coupon.findUnique({
        where: { code: String(couponCode).toUpperCase() },
        include: { applicableCategories: true, applicableProducts: true },
      });
      const check = await validateCouponForOrder(coupon, userId, lines, byId as any);
      if (!check.valid) throw BadRequest(check.message, "COUPON_INVALID");
      discount = check.discount;
    }

    const shipping = subtotal - discount > 0 ? await shippingChargeFor(subtotal - discount) : 0;
    const total = round2(subtotal - discount + shipping);
    const orderNumber = genOrderNumber();

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          userId,
          status: "pending",
          paymentMethod,
          shippingAddressId: address.id,
          billingAddressId: address.id,
          subtotal,
          shippingCharge: shipping,
          discountAmount: discount,
          couponCode: coupon?.code ?? null,
          couponId: coupon?.id ?? null,
          totalAmount: total,
          shippingMethod: shippingMethod ?? "standard",
          notes: notes ?? null,
          items: {
            create: lines.map((l) => {
              const p = byId.get(l.productId)!;
              const unit = effectiveUnitPrice(p, l.quantity);
              return {
                productId: p.id,
                productName: p.name,
                productSku: p.sku,
                quantity: l.quantity,
                price: unit,
                total: round2(unit * l.quantity),
              };
            }),
          },
          statusHistory: { create: { status: "pending", notes: "Order placed" } },
          payments: {
            create: { gatewayPaymentId: `pay_${orderNumber}`, paymentMethod, amount: total, status: "pending" },
          },
        },
        include: { items: true },
      });

      for (const line of lines) {
        await tx.product.update({
          where: { id: line.productId },
          data: { stockQuantity: { decrement: line.quantity } },
        });
      }

      if (coupon) {
        await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
        await tx.couponUsage.create({ data: { couponId: coupon.id, userId, orderId: created.id } });
      }

      await tx.cartItem.deleteMany({ where: { userId } });
      await tx.cartSession.update({ where: { userId }, data: { couponId: null } }).catch(() => {});
      return created;
    });

    await prisma.notification.create({
      data: {
        userId,
        type: "order",
        title: "Order confirmed",
        message: `Your order ${orderNumber} has been placed successfully.`,
        data: { orderId: order.id },
      },
    });

    let razorpayOrder: any = null;
    if (paymentMethod === "razorpay") {
      razorpayOrder = await createRazorpayOrder(Math.round(total * 100), orderNumber, { orderId: order.id });
    }

    await logActivity(req, "order.create", "order", order.id, { newData: { orderNumber, total } });

    res.json({
      success: true,
      data: {
        order: {
          id: order.id,
          orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalAmount: order.totalAmount.toString(),
        },
        razorpayOrder,
        mockPayment: razorpayOrder?.mock ?? false,
      },
    });
  })
);

// GET /api/orders - customer order history
ordersRouter.get(
  "/",
  authRequired,
  asyncH(async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const userId = (req as any).user.id;
    const where = { userId };
    const [total, items] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        include: { items: { take: 1 }, _count: { select: { items: true } } },
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
          itemsCount: o._count.items,
          firstItemName: o.items[0]?.productName ?? null,
        })),
        total,
        page,
        pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  })
);

// GET /api/orders/:id
ordersRouter.get(
  "/:id",
  authRequired,
  asyncH(async (req, res) => {
    const order = await loadOrder(req.params.id, {
      items: true,
      shippingAddress: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
      payments: true,
      returnRequests: { include: { items: true } },
    });
    if (!order) throw NotFound("Order not found");
    const user = (req as any).user;
    if (order.userId !== user.id && !adminRoles(user.role)) throw Forbidden();
    res.json({ success: true, data: order });
  })
);

// GET /api/orders/:id/status
ordersRouter.get(
  "/:id/status",
  authRequired,
  asyncH(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { statusHistory: { orderBy: { createdAt: "asc" } } },
    });
    if (!order) throw NotFound("Order not found");
    const user = (req as any).user;
    if (order.userId !== user.id && !adminRoles(user.role)) throw Forbidden();
    res.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        timeline: order.statusHistory.map((h) => ({ status: h.status, notes: h.notes, at: h.createdAt })),
      },
    });
  })
);

// POST /api/orders/:id/cancel
ordersRouter.post(
  "/:id/cancel",
  authRequired,
  asyncH(async (req, res) => {
    const order = await loadOrder(req.params.id, { items: true });
    if (!order) throw NotFound("Order not found");
    const user = (req as any).user;
    if (order.userId !== user.id && !adminRoles(user.role)) throw Forbidden();
    if (!["pending", "processing"].includes(order.status)) {
      throw BadRequest(`Order cannot be cancelled in "${order.status}" status`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: "cancelled" } });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: "cancelled", notes: "Cancelled", updatedBy: user.id },
      });
      for (const item of order.items) {
        if (item.productId) {
          await tx.product.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity } } });
        }
      }
      await tx.payment.updateMany({
        where: { orderId: order.id, status: "pending" },
        data: { status: order.paymentStatus === "paid" ? "refunded" : "failed" },
      });
    });
    if (order.userId) {
      await prisma.notification.create({
        data: { userId: order.userId, type: "order", title: "Order cancelled", message: `Order ${order.orderNumber} has been cancelled.` },
      });
    }
    await logActivity(req, "order.cancel", "order", order.id);
    res.json({ success: true, data: { message: "Order cancelled" } });
  })
);

// POST /api/orders/:id/reorder - add previous items back to cart
ordersRouter.post(
  "/:id/reorder",
  authRequired,
  asyncH(async (req, res) => {
    const order = await loadOrder(req.params.id, { items: true });
    if (!order || order.userId !== (req as any).user.id) throw NotFound("Order not found");
    for (const item of order.items) {
      if (!item.productId) continue;
      const existing = await prisma.cartItem.findFirst({ where: { userId: order.userId!, productId: item.productId } });
      if (existing) {
        await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + item.quantity, isSavedForLater: false } });
      } else {
        await prisma.cartItem.create({ data: { userId: order.userId!, productId: item.productId, quantity: item.quantity } });
      }
    }
    res.json({ success: true, data: { message: "Items added to your cart" } });
  })
);

// GET /api/orders/:id/invoice
ordersRouter.get(
  "/:id/invoice",
  authRequired,
  asyncH(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) throw NotFound("Order not found");
    const user = (req as any).user;
    if (order.userId !== user.id && !adminRoles(user.role)) throw Forbidden();
    const invoice = await buildInvoice(order.id);
    res.json({ success: true, data: invoice });
  })
);
