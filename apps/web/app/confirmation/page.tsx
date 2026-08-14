"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<div className="center muted" style={{ padding: 80 }}>Loading…</div>}>
      <ConfirmationInner />
    </Suspense>
  );
}

function ConfirmationInner() {
  const params = useSearchParams();
  const number = params.get("number");
  const id = params.get("id");

  return (
    <div className="panel center" style={{ maxWidth: 560, margin: "40px auto", padding: "48px 32px" }}>
      <div style={{ fontSize: 56 }}>✅</div>
      <h1 style={{ margin: "12px 0" }}>Order Placed!</h1>
      <p className="muted">
        Thank you for your order. Your order number is:
      </p>
      <h2 style={{ color: "var(--primary)", margin: "8px 0 20px" }}>{number}</h2>
      <p className="small muted">
        We've sent a confirmation. You can track your order status anytime.
      </p>
      <div className="gap-8" style={{ justifyContent: "center", marginTop: 20 }}>
        {id && <Link href={`/orders/${id}`} className="btn">View Order Details</Link>}
        <Link href="/products" className="btn secondary">Continue Shopping</Link>
      </div>
    </div>
  );
}
