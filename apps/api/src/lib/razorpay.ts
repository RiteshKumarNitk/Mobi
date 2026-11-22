import crypto from "crypto";
import Razorpay from "razorpay";
import { env } from "./env";

/**
 * Payment modes:
 *  - "razorpay": keys configured — real (test or live) Razorpay orders, HMAC signature checks.
 *  - "mock":     development only, no keys — fake gateway orders so the flow can be exercised locally.
 *  - "disabled": production without keys — online payment is refused; COD still works.
 *
 * Mock mode can never be active when NODE_ENV=production (env.allowMockPayments is false there).
 */
export type PaymentMode = "razorpay" | "mock" | "disabled";

let client: Razorpay | null = null;
if (env.razorpayKeyId && env.razorpayKeySecret) {
  client = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
}

export function paymentMode(): PaymentMode {
  if (client) return "razorpay";
  return env.allowMockPayments ? "mock" : "disabled";
}

export const razorpayConfigured = Boolean(client);
export const razorpayKeyId = () => (client ? env.razorpayKeyId : null);

export const MOCK_ORDER_PREFIX = "order_mock_";

export interface GatewayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  mock: boolean;
  keyId: string | null;
}

export async function createRazorpayOrder(amountPaise: number, receipt: string, notes?: Record<string, string>): Promise<GatewayOrder> {
  const mode = paymentMode();
  if (mode === "disabled") throw new Error("Online payments are not configured");
  if (mode === "mock") {
    return { id: `${MOCK_ORDER_PREFIX}${crypto.randomBytes(8).toString("hex")}`, amount: amountPaise, currency: "INR", receipt, mock: true, keyId: null };
  }
  const order = (await client!.orders.create({ amount: amountPaise, currency: "INR", receipt, notes })) as any;
  return { id: order.id, amount: Number(order.amount), currency: order.currency, receipt: order.receipt, mock: false, keyId: env.razorpayKeyId };
}

function hmacHex(secret: string, payload: string | Buffer): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify the checkout callback signature. In mock mode only mock gateway orders
 * are accepted (and mock mode itself is impossible in production).
 */
export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  const mode = paymentMode();
  if (mode === "mock") return orderId.startsWith(MOCK_ORDER_PREFIX);
  if (mode === "disabled") return false;
  return safeEqualHex(hmacHex(env.razorpayKeySecret, `${orderId}|${paymentId}`), signature);
}

/** Verify a webhook body against X-Razorpay-Signature (HMAC-SHA256 of the raw body with the webhook secret). */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!env.razorpayWebhookSecret || !signature) return false;
  return safeEqualHex(hmacHex(env.razorpayWebhookSecret, rawBody), signature);
}

/**
 * Fetch the authoritative payment record from Razorpay (amount, status, order).
 * Returns null in mock mode. A client-supplied payment id is never trusted on
 * its own — amount and order binding are checked against this.
 */
export async function fetchGatewayPayment(paymentId: string): Promise<{ id: string; order_id: string; amount: number; currency: string; status: string } | null> {
  if (paymentMode() !== "razorpay") return null;
  const p = (await client!.payments.fetch(paymentId)) as any;
  return { id: p.id, order_id: p.order_id, amount: Number(p.amount), currency: p.currency, status: p.status };
}
