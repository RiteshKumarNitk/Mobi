import crypto from "crypto";
import Razorpay from "razorpay";
import { env } from "./env";

let client: Razorpay | null = null;
if (env.razorpayKeyId && env.razorpayKeySecret) {
  client = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
}

export const razorpayConfigured = Boolean(client);

export async function createRazorpayOrder(
  amountPaise: number,
  receipt: string,
  notes?: Record<string, string>
): Promise<Record<string, unknown>> {
  if (!client) {
    // Mock mode: lets the whole flow run locally without Razorpay keys.
    return {
      id: `order_mock_${Math.random().toString(36).slice(2, 10)}`,
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes,
      mock: true,
    };
  }
  return (await client.orders.create({ amount: amountPaise, currency: "INR", receipt, notes })) as unknown as Record<string, unknown>;
}

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!client) return true; // mock mode: accept
  const expected = crypto
    .createHmac("sha256", env.razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return expected === signature;
}
