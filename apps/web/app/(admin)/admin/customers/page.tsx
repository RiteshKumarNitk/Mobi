"use client";

import { useEffect, useState } from "react";
import { api, fmt, fmtDate, getToken } from "@/lib/adminApi";
import { useRouter } from "next/navigation";

export default function CustomersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", password: "", email: "", shopName: "", gstNumber: "" });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!getToken()) return router.push("/admin/login");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (search = q) => {
    try {
      const d = await api(`/admin/customers?pageSize=50${search ? `&q=${encodeURIComponent(search)}` : ""}`);
      setRows(d.items);
    } catch { /* ignore */ }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/admin/customers", { method: "POST", body: JSON.stringify(form) });
      setShowForm(false);
      setMsg("Customer created");
      setForm({ name: "", phone: "", password: "", email: "", shopName: "", gstNumber: "" });
      load();
    } catch (err: any) {
      setMsg(err.message);
    }
  };

  const setStatus = async (id: string, status: string) => {
    await api(`/admin/customers/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
    load();
  };

  return (
    <div>
      <div className="between mb-16">
        <h2 style={{ margin: 0 }}>Customers</h2>
        <button className="btn sm" onClick={() => setShowForm(!showForm)}>+ Add Customer</button>
      </div>
      {msg && <div className="alert success">{msg}</div>}

      {showForm && (
        <form className="panel mb-16" onSubmit={add}>
          <h3>Add Customer</h3>
          <div className="form-row">
            <div><label className="label">Name *</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">Phone *</label><input className="input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })} /></div>
          </div>
          <div className="form-row">
            <div><label className="label">Password *</label><input className="input" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div><label className="label">Email</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div><label className="label">Shop Name</label><input className="input" value={form.shopName} onChange={(e) => setForm({ ...form, shopName: e.target.value })} /></div>
            <div><label className="label">GST</label><input className="input" value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} /></div>
          </div>
          <div className="flex mt-16">
            <button className="btn" type="submit">Create</button>
            <button className="btn secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="flex mb-16">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search name, phone, shop…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(q)} />
        <button className="btn sm" onClick={() => load()}>Search</button>
      </div>

      <div className="panel" style={{ padding: 0, overflow: "auto" }}>
        <table className="table">
          <thead>
            <tr><th>Customer</th><th>Phone</th><th>Shop</th><th>Orders</th><th>Total Spent</th><th>Status</th><th>Joined</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.firstName} {c.lastName}</td>
                <td>{c.phone}</td>
                <td className="small">{c.shopName ?? "—"}</td>
                <td>{c.orderCount}</td>
                <td><strong>{fmt(c.totalSpent)}</strong></td>
                <td><span className={`pill ${c.status}`}>{c.status}</span></td>
                <td className="small muted">{fmtDate(c.createdAt)}</td>
                <td>
                  <div className="flex">
                    {c.status === "active" ? (
                      <button className="btn sm danger" onClick={() => setStatus(c.id, "inactive")}>Deactivate</button>
                    ) : (
                      <button className="btn sm accent" onClick={() => setStatus(c.id, "active")}>Activate</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty-state">No customers found</div>}
      </div>
    </div>
  );
}
