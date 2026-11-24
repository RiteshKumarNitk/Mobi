import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { BadRequest, Conflict } from "./errors";
import { logger } from "./logger";
import { createRazorpayOrder, paymentMode, razorpayKeyId, type GatewayOrder } from "./razorpay";

/** Decimal rupees -> integer paise without floating-point drift. */
export const toPaise = (amount: Prisma.Decimal | number | string) => Math.round(Number(amount) * 100);

type OrderForPayment = { id: string; orderNumber: string; totalAmount: Prisma.Decimal; paymentStatus: string; status: string; paymentMethod: string | null };

/**
 * Return the gateway order for an online-payment order, creating it on first
 * use. The gateway order id is stored on our Payment row, binding every later
 * callback / webhook to exactly this order. Reused on retries so one order can
 * never be charged through two different gateway orders.
 */
export async function ensureGatewayOrder(order: OrderForPayment): Promise<GatewayOrder> {
  if (order.paymentMethod !== "razorpay") throw BadRequest("This order is not an online-payment order");
  if (order.paymentStatus === "paid") throw Conflict("This order is already paid");
  if (order.status === "cancelled") throw BadRequest("This order has been cancelled");
  if (paymentMode() === "disabled") throw BadRequest("Online payment is currently unavailable. Please choose Cash on Delivery.", "PAYMENTS_DISABLED");

  const payment = await prisma.payment.findFirst({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
  const amount = toPaise(order.totalAmount);
  if (payment?.gatewayOrderId && payment.status !== "paid") {
    const mock = payment.gatewayOrderId.startsWith("order_mock_");
    if (mock === (paymentMode() === "mock")) {
      return { id: payment.gatewayOrderId, amount, currency: "INR", receipt: order.orderNumber, mock, keyId: razorpayKeyId() };
    }
  }
  const gw = await createRazorpayOrder(amount, order.orderNumber, { orderId: order.id });
  if (gw.amount !== amount) throw new Error("Gateway order amount mismatch");
  if (payment) {
    await prisma.payment.update({ where: { id: payment.id }, data: { gatewayOrderId: gw.id, status: "pending", failureReason: null } });
  } else {
    await prisma.payment.create({
      data: { orderId: order.id, gatewayPaymentId: `pay_${order.orderNumber}`, gatewayOrderId: gw.id, paymentMethod: "razorpay", amount: order.totalAmount, status: "pending" },
    });
  }
  return gw;
}

export interface CapturedPayment {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  /** Amount actually captured, in paise, as reported by the gateway (or our own amount in mock mode). */
  amountPaise: number;
  source: "checkout" | "webhook";
  raw?: unknown;
}

/**
 * Mark the order bound to `gatewayOrderId` as paid. Idempotent: repeated
 * callbacks / webhook retries for an already-paid order are no-ops. Rejects
 * amounts that differ from the order total stored in our DB.
 */
export async function recordCapturedPayment(p: CapturedPayment): Promise<{ orderId: string; alreadyPaid: boolean }> {
  const payment = await prisma.payment.findUnique({ where: { gatewayOrderId: p.gatewayOrderId }, include: { order: true } });
  if (!payment) throw BadRequest("Unknown payment order", "PAYMENT_ORDER_UNKNOWN");
  const order = payment.order;
  if (p.amountPaise !== toPaise(order.totalAmount)) {
    logger.error("payment_amount_mismatch", { orderId: order.id, expected: toPaise(order.totalAmount), got: p.amountPaise, source: p.source });
    throw BadRequest("Payment amount does not match the order total", "PAYMENT_AMOUNT_MISMATCH");
  }
  if (payment.status === "paid") return { orderId: order.id, alreadyPaid: true };

  const updated = await prisma.$transaction(async (tx) => {
    // Conditional update = idempotency under concurrent callback + webhook.
    const { count } = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: "paid" } },
      data: {
        status: "paid",
        gatewayPaymentId: p.gatewayPaymentId,
        completedAt: new Date(),
        failureReason: null,
        gatewayResponse: (p.raw ?? undefined) as any,
      },
    });
    if (count === 0) return false;
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "paid" } });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: order.status,
        notes:
          order.status === "cancelled"
            ? `Payment ${p.gatewayPaymentId} received after cancellation — REFUND REQUIRED`
            : `Payment received (${p.gatewayPaymentId}, via ${p.source})`,
      },
    });
    return true;
  });
  if (!updated) return { orderId: order.id, alreadyPaid: true };

  if (order.userId) {
    await prisma.notification.create({
      data: {
        userId: order.userId,
        type: "payment",
        title: "Payment received",
        message: `Payment of ₹${Number(order.totalAmount).toLocaleString("en-IN")} received for order ${order.orderNumber}.`,
        data: { orderId: order.id },
      },
    });
  }
  logger.info("payment_captured", { orderId: order.id, source: p.source });
  return { orderId: order.id, alreadyPaid: false };
}

/** Record a failed attempt. Never downgrades a payment that is already paid. */
export async function recordFailedPayment(gatewayOrderId: string, reason: string) {
  await prisma.payment.updateMany({
    where: { gatewayOrderId, status: { in: ["pending", "failed"] } },
    data: { status: "failed", failureReason: reason.slice(0, 500) },
  });
}
