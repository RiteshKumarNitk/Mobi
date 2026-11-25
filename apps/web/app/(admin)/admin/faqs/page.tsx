"use client";

import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/adminApi";
import { useRouter } from "next/navigation";

const EMPTY = { question: "", answer: "", category: "General", displayOrder: "0", status: "active" };

export default function FaqsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState("");
  const [form, setForm] = useState<any>(EMPTY);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!getToken()) return router.push("/admin/login");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    try {
      const d = await api("/admin/faqs?pageSize=100");
      setRows(d.items);
    } catch { /* ignore */ }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...form, displayOrder: Number(form.displayOrder || 0) };
      if (editId) await api(`/admin/faqs/${editId}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api("/admin/faqs", { method: "POST", body: JSON.stringify(payload) });
      setShowForm(false);
      setMsg("Saved");
      load();
    } catch (err: any) {
      setMsg(err.message);
    }
  };

  const del = async (id: string) => {
    if (!window.confirm("Delete this FAQ?")) return;
    await api(`/admin/faqs/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <div className="between mb-16">
        <h2 style={{ margin: 0 }}>FAQs</h2>
        <button className="btn sm" onClick={() => { setEditId(""); setForm(EMPTY); setMsg(""); setShowForm(true); }}>+ Add FAQ</button>
      </div>
      {msg && <div className="alert success">{msg}</div>}

      {showForm && (
        <form className="panel mb-16" onSubmit={save}>
          <h3>{editId ? "Edit FAQ" : "Add FAQ"}</h3>
          <label className="label">Question *</label>
          <input className="input" required value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} />
          <label className="label">Answer *</label>
          <textarea className="textarea" rows={3} required value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} />
          <div className="form-row-3">
            <div><label className="label">Category</label><input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
            <div><label className="label">Display Order</label><input className="input" type="number" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} /></div>
            <div>
              <label className="label">Status</label>
              <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="flex mt-16">
            <button className="btn" type="submit">Save</button>
            <button className="btn secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="panel" style={{ padding: 0 }}>
        <table className="table">
          <thead><tr><th>Question</th><th>Category</th><th>Order</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id}>
                <td>{f.question}</td>
                <td><span className="pill active">{f.category}</span></td>
                <td>{f.displayOrder}</td>
                <td><span className={`pill ${f.status}`}>{f.status}</span></td>
                <td>
                  <div className="flex">
                    <button className="btn sm secondary" onClick={() => { setEditId(f.id); setForm({ ...f, displayOrder: String(f.displayOrder ?? 0) }); setMsg(""); setShowForm(true); }}>Edit</button>
                    <button className="btn sm danger" onClick={() => del(f.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty-state">No FAQs</div>}
      </div>
    </div>
  );
}
