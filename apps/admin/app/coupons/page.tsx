"use client";

import { useEffect, useState } from "react";
import { api, fmt, getToken } from "@/lib/api";
import { useRouter } from "next/navigation";

const EMPTY = {
  code: "", type: "percentage", value: "", minOrderAmount: "0", maxDiscountAmount: "",
  usageLimit: "", perUserLimit: "1", startDate: "", endDate: "", description: "", status: "active",
};

export default function CouponsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState("");
  const [form, setForm] = useState<any>(EMPTY);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!getToken()) return router.push("/login");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    try {
      const d = await api("/admin/coupons?pageSize=50");
      setRows(d.items);
    } catch { /* ignore */ }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        code: form.code,
        type: form.type,
        value: Number(form.value),
        minOrderAmount: Number(form.minOrderAmount),
        maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) : undefined,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        perUserLimit: Number(form.perUserLimit),
        startDate: form.startDate ? new Date(form.startDate).toISOString() : new Date().toISOString(),
        endDate: form.endDate ? new Date(form.endDate).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString(),
        description: form.description || undefined,
        status: form.status,
      };
      if (editId) await api(`/admin/coupons/${editId}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api("/admin/coupons", { method: "POST", body: JSON.stringify(payload) });
      setShowForm(false);
      setMsg(editId ? "Coupon updated" : "Coupon created");
      load();
    } catch (err: any) {
      setMsg(err.message);
    }
  };

  const del = async (id: string) => {
    if (!window.confirm("Delete this coupon?")) return;
    await api(`/admin/coupons/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <div className="between mb-16">
        <h2 style={{ margin: 0 }}>Coupons</h2>
        <button className="btn sm" onClick={() => { setEditId(""); setForm(EMPTY); setMsg(""); setShowForm(true); }}>+ Create Coupon</button>
      </div>
      {msg && <div className="alert success">{msg}</div>}

      {showForm && (
        <form className="panel mb-16" onSubmit={save}>
          <h3>{editId ? "Edit Coupon" : "Create Coupon"}</h3>
          <div className="form-row">
            <div>
              <label className="label">Code *</label>
              <input className="input" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SAVE10" />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed Amount</option>
              </select>
            </div>
          </div>
          <div className="form-row-3">
            <div><label className="label">Value *</label><input className="input" type="number" min={0} required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
            <div><label className="label">Min Order (₹)</label><input className="input" type="number" min={0} value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })} /></div>
            <div><label className="label">Max Discount (₹)</label><input className="input" type="number" min={0} value={form.maxDiscountAmount} onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })} /></div>
          </div>
          <div className="form-row-3">
            <div><label className="label">Usage Limit</label><input className="input" type="number" min={0} value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} /></div>
            <div><label className="label">Per User Limit</label><input className="input" type="number" min={1} value={form.perUserLimit} onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })} /></div>
            <div>
              <label className="label">Status</label>
              <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div><label className="label">Start Date</label><input className="input" type="date" value={form.startDate?.slice(0, 10)} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            <div><label className="label">End Date</label><input className="input" type="date" value={form.endDate?.slice(0, 10)} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
          </div>
          <label className="label">Description</label>
          <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex mt-16">
            <button className="btn" type="submit">Save</button>
            <button className="btn secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="panel" style={{ padding: 0, overflow: "auto" }}>
        <table className="table">
          <thead>
            <tr><th>Code</th><th>Type</th><th>Value</th><th>Min Order</th><th>Used</th><th>Valid</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.code}</strong></td>
                <td>{c.type}</td>
                <td>{c.type === "percentage" ? `${Number(c.value)}%` : fmt(c.value)}</td>
                <td>{fmt(c.minOrderAmount)}</td>
                <td>{c.usedCount} / {c.usageLimit ?? "∞"}</td>
                <td className="small muted">{(c.startDate ?? "").slice(0, 10)} → {(c.endDate ?? "").slice(0, 10)}</td>
                <td><span className={`pill ${c.status}`}>{c.status}</span></td>
                <td>
                  <div className="flex">
                    <button className="btn sm secondary" onClick={() => { setEditId(c.id); setForm({ ...EMPTY, ...c, value: Number(c.value), minOrderAmount: Number(c.minOrderAmount), maxDiscountAmount: c.maxDiscountAmount ? Number(c.maxDiscountAmount) : "", usageLimit: c.usageLimit ?? "", perUserLimit: c.perUserLimit, startDate: (c.startDate ?? "").slice(0, 10), endDate: (c.endDate ?? "").slice(0, 10) }); setMsg(""); setShowForm(true); }}>Edit</button>
                    <button className="btn sm danger" onClick={() => del(c.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty-state">No coupons yet</div>}
      </div>
    </div>
  );
}
