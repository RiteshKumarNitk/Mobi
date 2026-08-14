"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { inr } from "@/lib/format";

export default function CartPage() {
  const { cart, updateCartItem, removeCartItem, saveForLater, applyCoupon, removeCoupon } = useStore();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");

  const all = [...cart.items, ...cart.savedForLater];

  const doCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await applyCoupon(code);
      setCode("");
      setMsg("");
    } catch (err: any) {
      setMsg(err.message);
    }
  };

  if (!all.length) {
    return (
      <div className="empty-state">
        <h3>Your cart is empty</h3>
        <p>Browse our catalog and add some spare parts for your shop.</p>
        <Link href="/products" className="btn">Start Shopping</Link>
      </div>
    );
  }

  const line = (item: any, saved: boolean) => {
    const box = item.product.boxPrice && item.product.boxQuantity ? Number(item.product.boxQuantity) : null;
    const toBox = box ? Math.max(0, box - item.quantity) : null;
    return (
      <div key={item.id} className="panel mb-16" style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <img src={item.product.image ?? ""} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6 }} />
        <div style={{ flex: 1 }}>
          <Link href={`/products/${item.product.id}`} className="card-name" style={{ minHeight: 0 }}>{item.product.name}</Link>
          <div className="small muted">SKU: {item.product.sku} · {inr(item.unitPrice)} each</div>
          {!saved && item.bulkApplied && <span className="pill active">📦 Bulk rate applied</span>}
          {!saved && toBox !== null && toBox > 0 && (
            <div className="small" style={{ color: "var(--accent)", marginTop: 2 }}>
              Add {toBox}+ more to get box price {inr(item.product.boxPrice)}/pc
            </div>
          )}
          {saved && <span className="pill pending">Saved for later</span>}
        </div>
        {!saved && (
          <div className="flex" style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <button className="btn sm secondary" style={{ borderRadius: 0 }} onClick={() => updateCartItem(item.id, item.quantity - 1)}>−</button>
            <span style={{ minWidth: 40, textAlign: "center", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.quantity}</span>
            <button className="btn sm secondary" style={{ borderRadius: 0 }} onClick={() => updateCartItem(item.id, item.quantity + 1)}>+</button>
          </div>
        )}
        <div style={{ fontWeight: 800, minWidth: 90, textAlign: "right" }}>
          {inr(item.lineTotal)}
          {!saved && item.bulkApplied && <div className="small muted" style={{ fontWeight: 400 }}>{inr(item.unitPrice)} × {item.quantity}</div>}
        </div>
        <div className="gap-8 small">
          <button className="btn sm secondary" onClick={() => saveForLater(item.id, !saved)}>{saved ? "Move to cart" : "Save for later"}</button>
          <button className="btn sm danger" onClick={() => removeCartItem(item.id)}>Remove</button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Shopping Cart ({cart.items.length})</h1>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }} className="cart-cols">
        <div>
          {cart.items.map((i) => line(i, false))}
          {cart.savedForLater.length > 0 && (
            <>
              <h3>Saved for Later</h3>
              {cart.savedForLater.map((i) => line(i, true))}
            </>
          )}
        </div>

        <aside className="panel" style={{ position: "sticky", top: 140 }}>
          <h3 style={{ marginTop: 0 }}>Order Summary</h3>
          <form onSubmit={doCoupon} className="flex" style={{ gap: 8, marginBottom: 16 }}>
            <input className="input" placeholder="Coupon code" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn sm secondary" type="submit">Apply</button>
          </form>
          {msg && <div className="field-error mb-16">{msg}</div>}
          {cart.coupon && (
            <div className="alert success between" style={{ padding: "8px 12px" }}>
              <span>🎟 {cart.coupon.code} applied</span>
              <button className="btn sm secondary" onClick={removeCoupon}>✕</button>
            </div>
          )}

          <table className="table" style={{ marginBottom: 16 }}>
            <tbody>
              <tr><td>Subtotal</td><td style={{ textAlign: "right" }}>{inr(cart.summary.subtotal)}</td></tr>
              <tr><td>Discount</td><td style={{ textAlign: "right", color: "var(--accent)" }}>− {inr(cart.summary.discount)}</td></tr>
              <tr><td>Shipping</td><td style={{ textAlign: "right" }}>{Number(cart.summary.shipping) === 0 ? "FREE" : inr(cart.summary.shipping)}</td></tr>
              <tr style={{ fontWeight: 800, fontSize: 16 }}>
                <td>Total</td><td style={{ textAlign: "right" }}>{inr(cart.summary.total)}</td>
              </tr>
            </tbody>
          </table>
          <Link href="/checkout" className="btn block accent">Proceed to Checkout →</Link>
          <Link href="/quick-order" className="btn block secondary mt-8">⚡ Quick Order by SKU</Link>
          <Link href="/products" className="btn block secondary mt-8">Continue Shopping</Link>
        </aside>
      </div>
    </div>
  );
}
