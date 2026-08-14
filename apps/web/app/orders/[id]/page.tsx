"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime, inr } from "@/lib/format";

const STEP_ORDER = ["pending", "processing", "packed", "shipped", "delivered"];

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [invoice, setInvoice] = useState<any>(null);
  const [returnForm, setReturnForm] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setOrder(await api(`/orders/${id}`));
      } catch {
        /* not found */
      }
    })();
  }, [id]);

  if (!order) return <div className="center muted" style={{ padding: 80 }}>Loading order…</div>;

  const currentStep = STEP_ORDER.indexOf(order.status);
  const canCancel = ["pending", "processing"].includes(order.status);
  const canReturn = order.status === "delivered" && !order.returnRequests?.some((r: any) => ["pending", "approved", "processed"].includes(r.status));

  const cancel = async () => {
    if (!window.confirm("Cancel this order?")) return;
    await api(`/orders/${id}/cancel`, { method: "POST" });
    setOrder(await api(`/orders/${id}`));
  };

  const reorder = async () => {
    await api(`/orders/${id}/reorder`, { method: "POST" });
    router.push("/cart");
  };

  const toggleInvoice = async () => {
    if (invoice) {
      setInvoice(null);
      return;
    }
    try {
      setInvoice(await api(`/orders/${id}/invoice`));
    } catch {
      /* ignore */
    }
  };

  const submitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = order.items.map((i: any) => ({ orderItemId: i.id, quantity: i.quantity }));
    try {
      await api("/returns/create", { method: "POST", body: JSON.stringify({ orderId: order.id, reason: returnReason, items }) });
      setMsg("Return request submitted. Track it in the admin panel.");
      setReturnForm(false);
    } catch (err: any) {
      setMsg(err.message);
    }
  };

  return (
    <div>
      <div className="between mb-16">
        <h1 style={{ margin: 0 }}>Order {order.orderNumber}</h1>
        <div className="gap-8">
          <span className={`pill ${order.paymentStatus}`}>{order.paymentStatus}</span>
          <span className={`pill ${order.status}`}>{order.status}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }} className="cart-cols">
        <div>
          {/* Timeline */}
          <div className="panel mb-16">
            <h3>Order Progress</h3>
            <div className="flex mb-16" style={{ gap: 0 }}>
              {STEP_ORDER.map((s, i) => (
                <div key={s} style={{ flex: 1, textAlign: "center" }}>
                  <div
                    style={{
                      width: 22, height: 22, borderRadius: "50%", margin: "0 auto",
                      background: i <= currentStep ? "var(--accent)" : "var(--border)",
                      color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {i < currentStep ? "✓" : i + 1}
                  </div>
                  <div className="small" style={{ marginTop: 6, fontWeight: i <= currentStep ? 700 : 400, textTransform: "capitalize" }}>{s}</div>
                </div>
              ))}
            </div>
            <ul className="timeline">
              {[...order.statusHistory].reverse().map((h: any, i: number) => (
                <li key={i} className={i === 0 ? "done" : ""}>
                  <div className="t-title">{h.status}{h.notes ? ` — ${h.notes}` : ""}</div>
                  <div className="t-time">{fmtDateTime(h.createdAt)}</div>
                </li>
              ))}
            </ul>
          </div>

          {/* Items */}
          <div className="panel mb-16">
            <h3>Items</h3>
            <table className="table">
              <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th style={{ textAlign: "right" }}>Price</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
              <tbody>
                {order.items.map((i: any) => (
                  <tr key={i.id}>
                    <td>{i.productName}</td>
                    <td className="small muted">{i.productSku}</td>
                    <td>{i.quantity}</td>
                    <td style={{ textAlign: "right" }}>{inr(i.price)}</td>
                    <td style={{ textAlign: "right" }}>{inr(i.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="small" style={{ marginTop: 12, textAlign: "right" }}>
              Subtotal: {inr(order.subtotal)}<br />
              {Number(order.discountAmount) > 0 && <>Discount: − {inr(order.discountAmount)}<br /></>}
              Shipping: {Number(order.shippingCharge) === 0 ? "FREE" : inr(order.shippingCharge)}<br />
              <strong style={{ fontSize: 16 }}>Total: {inr(order.totalAmount)}</strong>
            </div>
          </div>

          {order.shippingAddress && (
            <div className="panel mb-16">
              <h3>Shipping Address</h3>
              <div>{order.shippingAddress.fullName} · {order.shippingAddress.phone}</div>
              <div className="small muted">
                {order.shippingAddress.addressLine1}{order.shippingAddress.addressLine2 ? `, ${order.shippingAddress.addressLine2}` : ""},
                {order.shippingAddress.city}, {order.shippingAddress.state} - {order.shippingAddress.pincode}
              </div>
            </div>
          )}

          {msg && <div className="alert info">{msg}</div>}
          {returnForm && (
            <form className="panel mb-16" onSubmit={submitReturn}>
              <h3>Initiate Return</h3>
              <label className="label">Reason</label>
              <select className="select" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} required>
                <option value="">Select reason…</option>
                <option>Defective / Not working</option>
                <option>Damaged in transit</option>
                <option>Wrong item delivered</option>
                <option>Wrong specification</option>
              </select>
              <button className="btn mt-16" type="submit">Submit Return Request</button>
            </form>
          )}
        </div>

        <aside className="panel" style={{ position: "sticky", top: 140 }}>
          <h3 style={{ marginTop: 0 }}>Actions</h3>
          <div className="gap-8" style={{ flexDirection: "column" }}>
            <button className="btn secondary block" onClick={toggleInvoice}>
              🧾 View GST Invoice
            </button>
            {canCancel && <button className="btn danger block" onClick={cancel}>Cancel Order</button>}
            {canReturn && <button className="btn secondary block" onClick={() => setReturnForm(true)}>↩ Request Return</button>}
            <button className="btn block" onClick={reorder}>🔄 Reorder</button>
          </div>
        </aside>
      </div>

      {invoice && (
        <div className="panel mt-24" id="invoice-print">
          <div className="between wrap" style={{ gap: 12 }}>
            <div>
              <h2 style={{ margin: 0 }}>{invoice.company.name}</h2>
              <div className="small muted">
                {invoice.company.address}<br />
                {invoice.company.phone}{invoice.company.email ? ` · ${invoice.company.email}` : ""}<br />
                <strong>GSTIN: {invoice.company.gst || "N/A"}</strong>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <strong style={{ fontSize: 18 }}>TAX INVOICE</strong>
              <div className="small muted">
                {invoice.invoiceNumber}<br />Date: {fmtDate(invoice.date)}<br />Order: {invoice.orderNumber}
              </div>
            </div>
          </div>
          <hr />
          <div className="small mb-16" style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <strong>Bill To:</strong><br />
              {invoice.customer.name} · {invoice.customer.phone}<br />
              {invoice.customer.address}<br />
              <strong>Buyer GSTIN: {invoice.customer.gst || "N/A"}</strong>
            </div>
            <div style={{ textAlign: "right" }}>
              <div>Payment: <strong>{invoice.paymentMethod} · {invoice.paymentStatus}</strong></div>
              <div className="muted">{invoice.gatewayPaymentId}</div>
            </div>
          </div>
          <table className="table mb-16">
            <thead><tr><th>Item</th><th>SKU</th><th>HSN</th><th>Qty</th><th style={{ textAlign: "right" }}>Price</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
            <tbody>
              {invoice.items.map((i: any, idx: number) => (
                <tr key={idx}>
                  <td>{i.name}</td><td>{i.sku}</td><td>{i.hsn ?? "—"}</td><td>{i.quantity}</td>
                  <td style={{ textAlign: "right" }}>{inr(i.price)}</td><td style={{ textAlign: "right" }}>{inr(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: "right" }}>
            Taxable value: {inr(invoice.taxableValue)}<br />
            CGST: {inr(invoice.cgst)}<br />
            SGST: {inr(invoice.sgst)}<br />
            Subtotal: {inr(invoice.subtotal)}<br />
            {Number(invoice.discount) > 0 && <>Discount: − {inr(invoice.discount)}<br /></>}
            Shipping: {Number(invoice.shipping) === 0 ? "FREE" : inr(invoice.shipping)}<br />
            <strong style={{ fontSize: 17 }}>Total: {inr(invoice.total)}</strong>
          </div>
          <div className="small muted mt-16" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>{invoice.terms}</div>
          <div className="gap-8 mt-16">
            <button
              className="btn sm"
              onClick={() => {
                const prev = document.title;
                document.title = `${invoice.invoiceNumber} - GST Invoice`;
                window.print();
                setTimeout(() => (document.title = prev), 2000);
              }}
            >
              ⬇ Download / Print GST Invoice (PDF)
            </button>
          </div>
        </div>
      )}

      <div className="small muted mt-16">
        <Link href="/account?tab=orders">← Back to orders</Link>
      </div>
    </div>
  );
}
