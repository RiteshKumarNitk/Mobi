"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { inr } from "@/lib/format";

type Step = 1 | 2 | 3;

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="center muted" style={{ padding: 80 }}>Loading…</div>}>
      <CheckoutInner />
    </Suspense>
  );
}

function CheckoutInner() {
  const router = useRouter();
  const { user, cart, refreshCart } = useStore();
  const [step, setStep] = useState<Step>(1);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [shippingMethod, setShippingMethod] = useState("standard");
  const [paymentMethod, setPaymentMethod] = useState<"razorpay" | "cod">("razorpay");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [newAddress, setNewAddress] = useState<any>({});
  const [showNew, setShowNew] = useState(false);

  const [form, setForm] = useState({
    fullName: "", phone: "", addressLine1: "", addressLine2: "", landmark: "", city: "", state: "", pincode: "", addressType: "Shop",
  });

  useEffect(() => {
    if (!user) {
      router.push("/login?next=/checkout");
      return;
    }
    (async () => {
      try {
        const addrs = await api("/customers/addresses");
        setAddresses(addrs);
        if (addrs.length && !selectedAddress) setSelectedAddress(addrs.find((a: any) => a.isDefault)?.id ?? addrs[0].id);
      } catch {
        /* ignore */
      }
    })();
  }, [user]);

  if (!user) return null;
  if (!cart.items.length) {
    return (
      <div className="empty-state">
        <h3>Your cart is empty</h3>
        <Link href="/products" className="btn">Browse Products</Link>
      </div>
    );
  }

  const saveNewAddress = async () => {
    const addr = await api("/customers/addresses", { method: "POST", body: JSON.stringify(form) });
    setAddresses((a) => [...a, addr]);
    setSelectedAddress(addr.id);
    setShowNew(false);
  };

  const placeOrder = async () => {
    setPlacing(true);
    setError("");
    try {
      const data = await api("/orders/create", {
        method: "POST",
        body: JSON.stringify({
          addressId: selectedAddress,
          paymentMethod,
          shippingMethod,
          notes: notes || undefined,
          couponCode: cart.coupon?.code ?? undefined,
        }),
      });
      await refreshCart();
      if (paymentMethod === "cod" || data.mockPayment) {
        router.push(`/confirmation?id=${data.order.id}&number=${data.order.orderNumber}`);
      } else {
        // Razorpay checkout
        const rzp = data.razorpayOrder;
        try {
          // Mock gateway screen: simulates a Razorpay payment flow
          const ok = window.confirm(
            `Razorpay checkout (mock mode)\n\nOrder: ₹${inr(data.order.totalAmount)}\nRazorpay Order ID: ${rzp.id}\n\nIn production this opens the Razorpay checkout. Click OK to simulate a successful payment.`
          );
          if (ok) {
            await api("/payments/verify", {
              method: "POST",
              body: JSON.stringify({
                orderId: data.order.id,
                razorpayOrderId: rzp.id,
                razorpayPaymentId: `pay_mock_${rzp.id}`,
                razorpaySignature: "mock-signature",
              }),
            });
            router.push(`/confirmation?id=${data.order.id}&number=${data.order.orderNumber}`);
          } else {
            router.push(`/account?tab=orders`);
          }
        } catch {
          router.push(`/account?tab=orders`);
        }
      }
    } catch (err: any) {
      setError(err.message);
      setPlacing(false);
    }
  };

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Checkout</h1>
      <div className="steps">
        <div className={`step ${step >= 1 ? "done" : ""}`}>1 · Address</div>
        <div className={`step ${step >= 2 ? "active" : step === 2 ? "active" : ""} ${step > 2 ? "done" : ""}`}>2 · Delivery & Payment</div>
        <div className={`step ${step === 3 ? "active" : ""}`}>3 · Confirm</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }} className="cart-cols">
        <div>
          {error && <div className="form-error">{error}</div>}

          {step === 1 && (
            <div className="panel">
              <h3>Delivery Address</h3>
              {addresses.map((a) => (
                <label key={a.id} className="panel" style={{ display: "flex", gap: 10, marginBottom: 10, cursor: "pointer", padding: 14 }}>
                  <input type="radio" name="addr" checked={selectedAddress === a.id} onChange={() => setSelectedAddress(a.id)} />
                  <div>
                    <strong>{a.fullName}</strong> · {a.phone}
                    <div className="small muted">
                      {a.addressLine1}{a.addressLine2 ? `, ${a.addressLine2}` : ""}, {a.city}, {a.state} - {a.pincode}
                    </div>
                    <span className="pill pending">{a.addressType}</span> {a.isDefault && <span className="pill delivered">Default</span>}
                  </div>
                </label>
              ))}

              {showNew ? (
                <div className="mt-16">
                  <h4>New Address</h4>
                  <div className="form-row">
                    <div><label className="label">Full Name</label><input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
                    <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  </div>
                  <label className="label">Address Line 1</label>
                  <input className="input" value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} />
                  <div className="form-row">
                    <div><label className="label">City</label><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                    <div><label className="label">State</label><input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
                  </div>
                  <div className="form-row">
                    <div><label className="label">Pincode</label><input className="input" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></div>
                    <div>
                      <label className="label">Type</label>
                      <select className="select" value={form.addressType} onChange={(e) => setForm({ ...form, addressType: e.target.value })}>
                        <option>Shop</option><option>Home</option><option>Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="gap-8 mt-16">
                    <button className="btn accent" onClick={saveNewAddress}>Save & Use</button>
                    <button className="btn secondary" onClick={() => setShowNew(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="btn secondary mt-16" onClick={() => setShowNew(true)}>+ Add New Address</button>
              )}

              <button className="btn mt-24" disabled={!selectedAddress} onClick={() => setStep(2)}>Continue →</button>
            </div>
          )}

          {step === 2 && (
            <div className="panel">
              <h3>Shipping Method</h3>
              <label className="panel" style={{ display: "flex", gap: 10, marginBottom: 10, cursor: "pointer" }}>
                <input type="radio" name="ship" checked={shippingMethod === "standard"} onChange={() => setShippingMethod("standard")} />
                <div>
                  <strong>Standard Delivery</strong> <span className="muted small">2-5 business days</span>
                  <div className="small muted">{Number(cart.summary.shipping) === 0 ? "FREE" : inr(cart.summary.shipping)}</div>
                </div>
              </label>

              <h3 className="mt-24">Payment Method</h3>
              <label className="panel" style={{ display: "flex", gap: 10, marginBottom: 10, cursor: "pointer" }}>
                <input type="radio" name="pay" checked={paymentMethod === "razorpay"} onChange={() => setPaymentMethod("razorpay")} />
                <div><strong>Razorpay</strong> <span className="muted small">UPI, Cards, Net Banking, Wallet</span></div>
              </label>
              <label className="panel" style={{ display: "flex", gap: 10, cursor: "pointer" }}>
                <input type="radio" name="pay" checked={paymentMethod === "cod"} onChange={() => setPaymentMethod("cod")} />
                <div><strong>Cash on Delivery</strong></div>
              </label>

              <label className="label">Order Notes (optional)</label>
              <textarea className="textarea" rows={2} placeholder="Anything we should know?" value={notes} onChange={(e) => setNotes(e.target.value)} />

              <div className="gap-8 mt-24">
                <button className="btn secondary" onClick={() => setStep(1)}>← Back</button>
                <button className="btn accent" onClick={() => setStep(3)}>Review Order →</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="panel">
              <h3>Confirm Order</h3>
              {(() => {
                const addr = addresses.find((a) => a.id === selectedAddress);
                return (
                  <div className="mb-16">
                    <strong>Deliver to:</strong> {addr?.fullName}, {addr?.addressLine1}, {addr?.city}, {addr?.state} - {addr?.pincode}
                    <div className="small muted">{addr?.phone}</div>
                  </div>
                );
              })()}
              <table className="table mb-16">
                <thead><tr><th>Item</th><th>Qty</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
                <tbody>
                  {cart.items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.product.name}{i.bulkApplied && <span className="pill active small" style={{ marginLeft: 6 }}>bulk</span>}</td>
                      <td>{i.quantity}</td>
                      <td style={{ textAlign: "right" }}>{inr(i.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="small">
                Payment: <strong>{paymentMethod === "cod" ? "Cash on Delivery" : "Razorpay (UPI / Card / Net Banking)"}</strong>
                {cart.coupon && <div className="mt-8">Coupon: 🎟 {cart.coupon.code} (saves {inr(cart.summary.discount)})</div>}
              </div>
              <div className="gap-8 mt-24">
                <button className="btn secondary" onClick={() => setStep(2)}>← Back</button>
                <button className="btn accent" style={{ flex: 1 }} disabled={placing} onClick={placeOrder}>
                  {placing ? "Placing order…" : `Place Order · ${inr(cart.summary.total)}`}
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="panel" style={{ position: "sticky", top: 140 }}>
          <h3 style={{ marginTop: 0 }}>Order Summary</h3>
          {cart.items.map((i) => (
            <div key={i.id} className="between small" style={{ padding: "4px 0" }}>
              <span style={{ maxWidth: 180 }}>{i.product.name.slice(0, 34)}…</span>
              <span>{i.quantity} × {inr(i.unitPrice)}</span>
            </div>
          ))}
          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
          <div className="between small"><span>Subtotal</span><span>{inr(cart.summary.subtotal)}</span></div>
          <div className="between small"><span>Discount</span><span style={{ color: "var(--accent)" }}>− {inr(cart.summary.discount)}</span></div>
          <div className="between small"><span>Shipping</span><span>{Number(cart.summary.shipping) === 0 ? "FREE" : inr(cart.summary.shipping)}</span></div>
          <div className="between" style={{ fontWeight: 800, fontSize: 17, marginTop: 8 }}>
            <span>Total</span><span>{inr(cart.summary.total)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
