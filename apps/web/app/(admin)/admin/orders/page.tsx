"use client";

import { useEffect, useState } from "react";
import { api, fmt, fmtDate, getToken } from "@/lib/adminApi";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const STATUSES = ["", "pending", "processing", "packed", "shipped", "delivered", "cancelled", "returned"];

// Valid status transitions from a given state — the UI only offers these.
const TRANSITIONS: Record<string, string[]> = {
  pending: ["processing", "cancelled"],
  processing: ["packed", "cancelled"],
  packed: ["shipped"],
  shipped: ["delivered", "returned"],
  delivered: [],
  cancelled: [],
  returned: [],
};

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="center muted" style={{ padding: 80 }}>Loading…</div>}>
      <OrdersInner />
    </Suspense>
  );
}

function OrdersInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [detail, setDetail] = useState<any>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!getToken()) return router.push("/admin/login");
  }, []);

  const load = async (p = page, st = status, search = q) => {
    const sp = new URLSearchParams({ page: String(p), pageSize: "15" });
    if (st) sp.set("status", st);
    if (search) sp.set("q", search);
    try {
      const d = await api(`/admin/orders?${sp}`);
      setRows(d.items);
      setTotal(d.total);
      setPage(d.page);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = async (id: string) => {
    setDetail(await api(`/admin/orders/${id}`));
  };

  const setOrderStatus = async (next: string) => {
    try {
      await api(`/admin/orders/${detail.id}/status`, { method: "PUT", body: JSON.stringify({ status: next }) });
      setMsg(`Order marked as ${next}`);
      setDetail(await api(`/admin/orders/${detail.id}`));
      load();
    } catch (err: any) {
      setMsg(err.message);
    }
  };

  return (
    <div>
      <div className="between mb-16">
        <h2 style={{ margin: 0 }}>Orders ({total})</h2>
        <div className="flex">
          {STATUSES.map((s) => (
            <button key={s || "all"} className={`btn sm ${status === s ? "" : "secondary"}`} onClick={() => { setStatus(s); load(1, s); }}>
              {s || "All"}
            </button>
          ))}
        </div>
      </div>
      {msg && <div className="alert info">{msg}</div>}

      <div className="flex mb-16">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search order #, phone, name…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(1, status, q)} />
        <button className="btn sm" onClick={() => load(1, status, q)}>Search</button>
      </div>

      <div className="panel" style={{ padding: 0, overflow: "auto" }}>
        <table className="table">
          <thead>
            <tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td><strong>{o.orderNumber}</strong></td>
                <td className="small muted">{fmtDate(o.createdAt)}</td>
                <td>{o.customer}</td>
                <td>{o.itemsCount}</td>
                <td><strong>{fmt(o.totalAmount)}</strong></td>
                <td><span className={`pill ${o.paymentStatus}`}>{o.paymentMethod} · {o.paymentStatus}</span></td>
                <td><span className={`pill ${o.status}`}>{o.status}</span></td>
                <td><button className="btn sm secondary" onClick={() => openDetail(o.id)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty-state">No orders found</div>}
      </div>

      {total > 15 && (
        <div className="flex mt-16" style={{ justifyContent: "center" }}>
          {page > 1 && <button className="btn sm secondary" onClick={() => load(page - 1)}>← Prev</button>}
          <span className="small muted" style={{ alignSelf: "center" }}>Page {page} of {Math.ceil(total / 15)}</span>
          {page * 15 < total && <button className="btn sm secondary" onClick={() => load(page + 1)}>Next →</button>}
        </div>
      )}

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 860 }}>
            <div className="between">
              <h3>Order {detail.orderNumber}</h3>
              <button className="btn sm secondary" onClick={() => setDetail(null)}>✕ Close</button>
            </div>

            <div className="flex wrap mb-16">
              <span className={`pill ${detail.paymentStatus}`}>{detail.paymentMethod} · {detail.paymentStatus}</span>
              <span className={`pill ${detail.status}`}>{detail.status}</span>
              <span className="small muted">Placed {fmtDate(detail.createdAt)}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="panel">
                <h4>Customer</h4>
                <div>{detail.user ? `${detail.user.firstName ?? ""} ${detail.user.lastName ?? ""}`.trim() || detail.user.phone : "Guest"}</div>
                <div className="small muted">{detail.user?.phone} {detail.user?.shopName ? `· ${detail.user.shopName}` : ""}</div>
              </div>
              <div className="panel">
                <h4>Ship To</h4>
                {detail.shippingAddress ? (
                  <>
                    <div>{detail.shippingAddress.fullName} · {detail.shippingAddress.phone}</div>
                    <div className="small muted">
                      {detail.shippingAddress.addressLine1}, {detail.shippingAddress.city}, {detail.shippingAddress.state} - {detail.shippingAddress.pincode}
                    </div>
                  </>
                ) : <span className="muted small">—</span>}
              </div>
            </div>

            <div className="panel mt-16" style={{ padding: 0, overflow: "auto" }}>
              <table className="table">
                <thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
                <tbody>
                  {detail.items.map((i: any) => (
                    <tr key={i.id}>
                      <td>{i.productName}</td><td className="small muted">{i.productSku}</td>
                      <td>{i.quantity}</td><td>{fmt(i.price)}</td><td>{fmt(i.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="between mt-16">
              <div>
                <label className="label">Update Status</label>
                {(TRANSITIONS[detail.status] ?? []).length > 0 ? (
                  <div className="flex wrap">
                    {TRANSITIONS[detail.status].map((n) => (
                      <button key={n} className={`btn sm ${n === "cancelled" ? "danger" : ""}`} onClick={() => setOrderStatus(n)}>
                        {n}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="small muted">No further status changes for a {detail.status} order.</div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="small muted">Subtotal {fmt(detail.subtotal)} · Shipping {fmt(detail.shippingCharge)} · Discount −{fmt(detail.discountAmount)}</div>
                <strong style={{ fontSize: 18 }}>Total: {fmt(detail.totalAmount)}</strong>
              </div>
            </div>

            {detail.statusHistory?.length > 0 && (
              <div className="mt-16">
                <h4>Timeline</h4>
                <ul className="timeline" style={{ listStyle: "none", paddingLeft: 0 }}>
                  {[...detail.statusHistory].reverse().map((h: any, i: number) => (
                    <li key={i} style={{ padding: "3px 0" }}>
                      <span className={`pill ${h.status}`}>{h.status}</span>{" "}
                      <span className="small muted">{new Date(h.createdAt).toLocaleString()}</span>
                      {h.notes && <span className="small muted"> — {h.notes}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
