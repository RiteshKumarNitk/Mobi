import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncH } from "../lib/async";
import { BadRequest, NotFound } from "../lib/errors";
import { authRequired } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createRazorpayOrder, verifyRazorpaySignature } from "../lib/razorpay";

export const paymentsRouter = Router();

// POST /api/payments/razorpay/create-order
paymentsRouter.post(
  "/razorpay/create-order",
  authRequired,
  validate(z.object({ orderId: z.string().uuid() })),
  asyncH(async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.body.orderId } });
    if (!order || order.userId !== (req as any).user.id) throw NotFound("Order not found");
    const rzpOrder = await createRazorpayOrder(Math.round(Number(order.totalAmount) * 100), order.orderNumber, {
      orderId: order.id,
    });
    res.json({ success: true, data: rzpOrder });
  })
);

// POST /api/payments/verify - verify Razorpay signature and mark paid
paymentsRouter.post(
  "/verify",
  authRequired,
  validate(
    z.object({
      orderId: z.string().uuid(),
      razorpayOrderId: z.string(),
      razorpayPaymentId: z.string(),
      razorpaySignature: z.string(),
    })
  ),
  asyncH(async (req, res) => {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== (req as any).user.id) throw NotFound("Order not found");

    if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      throw BadRequest("Payment verification failed", "PAYMENT_VERIFY_FAILED");
    }

    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "paid" } }),
      prisma.payment.updateMany({
        where: { orderId: order.id },
        data: { status: "paid", gatewayPaymentId: razorpayPaymentId, completedAt: new Date() },
      }),
    ]);

    if (order.userId) {
      await prisma.notification.create({
        data: {
          userId: order.userId,
          type: "payment",
          title: "Payment received",
          message: `Payment of ₹${Number(order.totalAmount).toLocaleString("en-IN")} received for order ${order.orderNumber}.`,
        },
      });
    }
    res.json({ success: true, data: { message: "Payment verified" } });
  })
);
