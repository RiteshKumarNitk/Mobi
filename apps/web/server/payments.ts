import { type ApiRequest, type ApiResponse, defineRoute } from "@/lib/route";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError, BadRequest, NotFound } from "../lib/errors";
import { authRequired } from "../lib/auth";
import { validate } from "../lib/validate";
import { rateLimit } from "../lib/rateLimit";
import { logger } from "../lib/logger";
import { fetchGatewayPayment, paymentMode, verifyRazorpaySignature, verifyWebhookSignature } from "../lib/razorpay";
import { ensureGatewayOrder, recordCapturedPayment, recordFailedPayment, toPaise } from "../lib/payments";

// GET /api/payments/config - which payment options the storefront may offer
export const getConfig = defineRoute(
  (_req, res) => {
  const mode = paymentMode();
  return res.json({ success: true, data: { mode, onlineEnabled: mode !== "disabled", mock: mode === "mock" } });
}
);

// POST /api/payments/razorpay/create-order - (re)start online payment for an unpaid order
export const postRazorpayCreateOrder = defineRoute(
  authRequired,
  rateLimit({ max: 20 }),
  validate(z.object({ orderId: z.string().uuid() })),
  async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.body.orderId } });
    if (!order || order.userId !== req.user!.id) throw NotFound("Order not found");
    const gw = await ensureGatewayOrder(order);
    return res.json({ success: true, data: gw });
  }
);

// POST /api/payments/verify - checkout callback: verify signature + amount, then mark paid
export const postVerify = defineRoute(
  authRequired,
  rateLimit({ max: 20 }),
  validate(
    z.object({
      orderId: z.string().uuid(),
      razorpayOrderId: z.string().min(1).max(100),
      razorpayPaymentId: z.string().min(1).max(100),
      razorpaySignature: z.string().min(1).max(200),
    })
  ),
  async (req, res) => {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true } });
    if (!order || order.userId !== req.user!.id) throw NotFound("Order not found");

    // The gateway order must be the one WE created for THIS order — a valid signature
    // for some other (cheaper) order must not be replayable here.
    if (!order.payments.some((p) => p.gatewayOrderId === razorpayOrderId)) {
      throw BadRequest("Payment does not belong to this order", "PAYMENT_ORDER_MISMATCH");
    }
    if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      throw BadRequest("Payment verification failed", "PAYMENT_VERIFY_FAILED");
    }

    let amountPaise = toPaise(order.totalAmount);
    let raw: unknown;
    if (paymentMode() === "razorpay") {
      // Signature proves Razorpay issued this payment for the order; the fetched
      // record proves the captured amount and state.
      const gp = await fetchGatewayPayment(razorpayPaymentId);
      if (!gp || gp.order_id !== razorpayOrderId) throw BadRequest("Payment does not belong to this order", "PAYMENT_ORDER_MISMATCH");
      if (!["captured", "authorized"].includes(gp.status)) throw BadRequest(`Payment is ${gp?.status ?? "unknown"}, not captured`, "PAYMENT_NOT_CAPTURED");
      amountPaise = gp.amount;
      raw = gp;
    }
    const result = await recordCapturedPayment({ gatewayOrderId: razorpayOrderId, gatewayPaymentId: razorpayPaymentId, amountPaise, source: "checkout", raw });
    return res.json({ success: true, data: { message: result.alreadyPaid ? "Payment already verified" : "Payment verified", paymentStatus: "paid" } });
  }
);

// POST /api/payments/failed - checkout reported a failed/dismissed attempt (informational only)
export const postFailed = defineRoute(
  authRequired,
  validate(z.object({ orderId: z.string().uuid(), razorpayOrderId: z.string().min(1).max(100), reason: z.string().max(500).optional() })),
  async (req, res) => {
    const order = await prisma.order.findUnique({ where: { id: req.body.orderId }, include: { payments: true } });
    if (!order || order.userId !== req.user!.id) throw NotFound("Order not found");
    if (order.payments.some((p) => p.gatewayOrderId === req.body.razorpayOrderId)) {
      await recordFailedPayment(req.body.razorpayOrderId, req.body.reason ?? "Payment not completed");
    }
    return res.json({ success: true, data: { message: "Recorded" } });
  }
);

/**
 * POST /api/payments/razorpay/webhook — reads the raw request body
 * (the HMAC is computed over the exact bytes Razorpay sent).
 *
 * Configure in the Razorpay dashboard with events: payment.captured, order.paid,
 * payment.failed, refund.processed. Every event id is recorded once in
 * PaymentEvent, so Razorpay's retries are processed exactly once.
 */
export async function razorpayWebhookHandler(req: ApiRequest, res: ApiResponse) {
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || !verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature") ?? undefined)) {
    return res.json({ success: false, error: { code: "BAD_SIGNATURE", message: "Invalid webhook signature" } }, 401);
  }
  let event: any;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    return res.json({ success: false, error: { code: "BAD_REQUEST", message: "Invalid JSON" } }, 400);
  }
  const eventId = req.headers.get("x-razorpay-event-id") ?? `${event.event}:${event.payload?.payment?.entity?.id ?? event.payload?.refund?.entity?.id ?? event.created_at}`;

  try {
    await prisma.paymentEvent.create({ data: { eventId, eventType: String(event.event ?? "unknown"), payload: event } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return res.json({ success: true, data: { duplicate: true } });
    }
    throw e;
  }

  try {
    const payment = event.payload?.payment?.entity;
    switch (event.event) {
      case "payment.captured":
      case "order.paid":
        if (payment?.order_id) {
          await recordCapturedPayment({ gatewayOrderId: payment.order_id, gatewayPaymentId: payment.id, amountPaise: Number(payment.amount), source: "webhook", raw: payment });
        }
        break;
      case "payment.failed":
        if (payment?.order_id) await recordFailedPayment(payment.order_id, payment.error_description ?? "Payment failed");
        break;
      case "refund.processed": {
        const refund = event.payload?.refund?.entity;
        if (refund?.payment_id) {
          await prisma.payment.updateMany({
            where: { gatewayPaymentId: refund.payment_id },
            data: { gatewayResponse: { lastRefund: refund } as any },
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (e: any) {
    if (e instanceof ApiError && e.status < 500) {
      // Permanent problem (unknown order, amount mismatch): retrying will not help.
      // Keep the ledger entry, alert via logs, and acknowledge so Razorpay stops retrying.
      logger.error("webhook_rejected", { eventId, event: event.event, code: e.code, message: e.message });
      return res.json({ success: true, data: { processed: false, reason: e.code } });
    }
    // Transient failure: remove the ledger entry so Razorpay's retry is processed again.
    await prisma.paymentEvent.delete({ where: { eventId } }).catch(() => {});
    logger.error("webhook_processing_failed", { eventId, event: event.event, error: e?.message });
    return res.json({ success: false, error: { code: "INTERNAL", message: "Webhook processing failed" } }, 500);
  }
  return res.json({ success: true, data: { processed: true } });
}

export const postRazorpayWebhook = defineRoute({ rawBody: true }, razorpayWebhookHandler);
