"use client";

import { useEffect, useState } from "react";
import { api, fmt, fmtDate, getToken } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function ReturnsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [refundAmount, setRefundAmount] = useState("");

  useEffect(() => {
    if (!getToken()) return router.push("/login");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    try {
      const d = await api("/admin/returns?pageSize=50");
      setRows(d.items);
    } catch { /* ignore */ }
  };

  const open = async (id: string) => {
    const d = await api(`/admin/returns/${id}`);
    setDetail(d);
    setRefundAmount(d.refundAmount ? String(Number(d.refundAmount)) : "");
  };

  const setStatus = async (status: string) => {
    try {
      await api(`/admin/returns/${detail.id}/status`, { method: "PUT", body: JSON.stringify({ status }) });
      setMsg(`Return marked ${status}`);
      load();
      setDetail(await api(`/admin/returns/${detail.id}`));
    } catch (err: any) {
      setMsg(err.message);
    }
  };

  const refund = async () => {
    await api(`/admin/returns/${detail.id}/refund`, { method: "POST", body: JSON.stringify({ refundAmount: refundAmount ? Number(refundAmount) : undefined }) });
    setMsg("Refund processed");
    load();
    setDetail(await api(`/admin/returns/${detail.id}`));
  };

  return (
    <div>
      <div className="between mb-16">
        <h2 style={{ margin: 0 }}>Returns</h2>
      </div>
      {msg && <div className="alert info">{msg}</div>}

      <div className="panel" style={{ padding: 0, overflow: "auto" }}>
        <table className="table">
          <thead>
            <tr><th>Return #</th><th>Order</th><th>Customer</th><th>Reason</th><th>Items</th><th>Status</th><th>Date</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.returnNumber}</strong></td>
                <td>{r.orderNumber}</td>
                <td>{r.customer}</td>
                <td className="small">{r.reason}</td>
                <td>{r.itemsCount}</td>
                <td><span className={`pill ${r.status}`}>{r.status}</span></td>
                <td className="small muted">{fmtDate(r.createdAt)}</td>
                <td><button className="btn sm secondary" onClick={() => open(r.id)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty-state">No return requests</div>}
      </div>

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="between">
              <h3>Return {detail.returnNumber}</h3>
              <button className="btn sm secondary" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="flex wrap mb-16">
              <span className="small muted">Order {detail.order.orderNumber}</span>
              <span className={`pill ${detail.status}`}>{detail.status}</span>
              {detail.refundAmount && <span className="pill paid">Refund {fmt(detail.refundAmount)}</span>}
            </div>
            <p className="muted">{detail.reason}{detail.description ? ` — ${detail.description}` : ""}</p>

            <table className="table mb-16">
              <thead><tr><th>Item</th><th>Qty</th></tr></thead>
              <tbody>
                {detail.items.map((i: any) => (
                  <tr key={i.id}>
                    <td>{i.orderItem?.productName ?? "—"}</td>
                    <td>{i.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {detail.adminNotes && <div className="alert info">Admin note: {detail.adminNotes}</div>}

            <label className="label">Admin Notes</label>
            <input className="input" defaultValue={detail.adminNotes ?? ""} onBlur={(e) => api(`/admin/returns/${detail.id}/status`, { method: "PUT", body: JSON.stringify({ status: detail.status, adminNotes: e.target.value }) }).catch(() => {})} />

            <div className="flex wrap mt-16">
              {["approved", "rejected", "processed", "completed"].map((s) => (
                <button key={s} className="btn sm secondary" onClick={() => setStatus(s)}>{s}</button>
              ))}
            </div>

            <div className="flex mt-16" style={{ alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label className="label">Refund Amount</label>
                <input className="input" type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
              </div>
              <button className="btn accent" onClick={refund}>Process Refund</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
