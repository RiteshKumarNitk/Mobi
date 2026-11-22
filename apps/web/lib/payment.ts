"use client";

import { api } from "./api";

export interface GatewayOrder {
  id: string;
  amount: number; // paise
  currency: string;
  mock: boolean;
  keyId: string | null;
}

export interface PaymentConfig {
  mode: "razorpay" | "mock" | "disabled";
  onlineEnabled: boolean;
  mock: boolean;
}

export const getPaymentConfig = () => api<PaymentConfig>("/payments/config");

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<any> {
  const w = window as any;
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Payment gateway failed to load")));
    s.onerror = () => reject(new Error("Could not load the payment gateway. Check your connection and retry."));
    document.head.appendChild(s);
  });
}

export type PaymentOutcome = "paid" | "dismissed" | "failed";

/**
 * Collect payment for an order and verify it server-side. The order only
 * becomes "paid" after the API verifies the gateway signature and amount —
 * the browser callback alone never marks an order paid.
 */
export async function payForOrder(
  orderId: string,
  gw: GatewayOrder,
  prefill: { name?: string; contact?: string; email?: string } = {}
): Promise<{ outcome: PaymentOutcome; message?: string }> {
  if (gw.mock) {
    // Development mock gateway (the API never issues mock orders in production).
    const ok = window.confirm(`TEST MODE — no real payment.\n\nAmount: ₹${(gw.amount / 100).toLocaleString("en-IN")}\n\nOK = simulate success, Cancel = simulate failure.`);
    if (!ok) {
      await api("/payments/failed", { method: "POST", body: JSON.stringify({ orderId, razorpayOrderId: gw.id, reason: "Cancelled in test mode" }) }).catch(() => {});
      return { outcome: "dismissed" };
    }
    await api("/payments/verify", {
      method: "POST",
      body: JSON.stringify({ orderId, razorpayOrderId: gw.id, razorpayPaymentId: `pay_mock_${Date.now()}`, razorpaySignature: "mock" }),
    });
    return { outcome: "paid" };
  }

  const Razorpay = await loadCheckout();
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: { outcome: PaymentOutcome; message?: string }) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const rzp = new Razorpay({
      key: gw.keyId,
      order_id: gw.id,
      amount: gw.amount,
      currency: gw.currency,
      name: "Baba Communication",
      description: "Order payment",
      prefill,
      theme: { color: "#0056b3" },
      handler: async (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        try {
          await api("/payments/verify", {
            method: "POST",
            body: JSON.stringify({
              orderId,
              razorpayOrderId: resp.razorpay_order_id,
              razorpayPaymentId: resp.razorpay_payment_id,
              razorpaySignature: resp.razorpay_signature,
            }),
          });
          done({ outcome: "paid" });
        } catch (e: any) {
          // Captured but not yet verified: the webhook will reconcile it.
          done({ outcome: "failed", message: `${e.message}. If money was deducted, it will be confirmed automatically within a few minutes.` });
        }
      },
      modal: { ondismiss: () => done({ outcome: "dismissed" }) },
    });
    rzp.on("payment.failed", (resp: any) => {
      const reason = resp?.error?.description ?? "Payment failed";
      api("/payments/failed", { method: "POST", body: JSON.stringify({ orderId, razorpayOrderId: gw.id, reason }) }).catch(() => {});
      done({ outcome: "failed", message: reason });
    });
    rzp.open();
  });
}

/** Retry payment for an existing unpaid online order. */
export async function retryPayment(orderId: string, prefill?: { name?: string; contact?: string; email?: string }) {
  const gw = await api<GatewayOrder>("/payments/razorpay/create-order", { method: "POST", body: JSON.stringify({ orderId }) });
  return payForOrder(orderId, gw, prefill);
}
