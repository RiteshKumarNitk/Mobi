"use client";

import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";
import { useRouter } from "next/navigation";

const EMPTY = { title: "", subtitle: "", imageUrl: "", linkUrl: "", type: "homepage", displayOrder: "0", status: "active" };

export default function BannersPage() {
  const router = useRouter();
  const [banners, setBanners] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [tab, setTab] = useState<"banners" | "offers">("banners");
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
      const [b, o] = await Promise.all([api("/admin/banners"), api("/admin/offers")]);
      setBanners(b);
      setOffers(o);
    } catch { /* ignore */ }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        title: form.title || undefined,
        subtitle: form.subtitle || undefined,
        imageUrl: form.imageUrl,
        linkUrl: form.linkUrl || undefined,
        displayOrder: Number(form.displayOrder || 0),
        status: form.status,
        ...(tab === "banners" ? { type: form.type } : {}),
      };
      const base = tab === "banners" ? "/admin/banners" : "/admin/offers";
      if (editId) await api(`${base}/${editId}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api(base, { method: "POST", body: JSON.stringify(payload) });
      setShowForm(false);
      setMsg("Saved");
      load();
    } catch (err: any) {
      setMsg(err.message);
    }
  };

  const del = async (id: string, isOffer: boolean) => {
    if (!window.confirm("Delete this item?")) return;
    await api(`${isOffer ? "/admin/offers" : "/admin/banners"}/${id}`, { method: "DELETE" });
    load();
  };

  const list = tab === "banners" ? banners : offers;

  return (
    <div>
      <div className="between mb-16">
        <h2 style={{ margin: 0 }}>Banners & Offers</h2>
        <div className="flex">
          <button className={`btn sm ${tab === "banners" ? "" : "secondary"}`} onClick={() => setTab("banners")}>Banners</button>
          <button className={`btn sm ${tab === "offers" ? "" : "secondary"}`} onClick={() => setTab("offers")}>Offers</button>
          <button className="btn sm" onClick={() => { setEditId(""); setForm({ ...EMPTY, type: tab === "offers" ? "offers" : "homepage" }); setMsg(""); setShowForm(true); }}>
            + Add {tab === "banners" ? "Banner" : "Offer"}
          </button>
        </div>
      </div>
      {msg && <div className="alert success">{msg}</div>}

      {showForm && (
        <form className="panel mb-16" onSubmit={save}>
          <h3>{editId ? "Edit" : "Add"} {tab === "banners" ? "Banner" : "Offer"}</h3>
          {tab === "banners" && (
            <>
              <label className="label">Type</label>
              <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="homepage">Homepage</option>
                <option value="special">Special</option>
              </select>
            </>
          )}
          <label className="label">Title</label>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <label className="label">Subtitle</label>
          <input className="input" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
          <label className="label">Image URL *</label>
          <input className="input" required value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
          <div className="form-row">
            <div><label className="label">Link URL</label><input className="input" value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} /></div>
            <div><label className="label">Display Order</label><input className="input" type="number" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: e.target.value })} /></div>
          </div>
          <label className="label">Status</label>
          <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <div className="flex mt-16">
            <button className="btn" type="submit">Save</button>
            <button className="btn secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="tile-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {list.map((b: any) => (
          <div key={b.id} className="panel">
            <img src={b.imageUrl} alt={b.title ?? ""} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 6 }} />
            <div className="between mt-8">
              <strong>{b.title ?? "(untitled)"}</strong>
              <span className={`pill ${b.status}`}>{b.status}</span>
            </div>
            <div className="small muted">{b.type} · order {b.displayOrder}</div>
            <div className="flex mt-8">
              <button className="btn sm secondary" onClick={() => { setEditId(b.id); setForm({ ...EMPTY, ...b, displayOrder: String(b.displayOrder ?? 0) }); setMsg(""); setShowForm(true); }}>Edit</button>
              <button className="btn sm danger" onClick={() => del(b.id, tab === "offers")}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {!list.length && <div className="empty-state">Nothing here yet</div>}
    </div>
  );
}
