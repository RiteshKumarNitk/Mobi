"use client";

import { useEffect, useState } from "react";
import { api, API_URL, fmt, fmtDate, getToken } from "@/lib/adminApi";
import { useRouter } from "next/navigation";

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  price: string;
  mrp: string | null;
  boxPrice?: string | null;
  boxQuantity?: number | null;
  hsnCode?: string | null;
  stockQuantity: number;
  stockStatus: string;
  isFeatured: boolean;
  isNew: boolean;
  isBestSeller: boolean;
  status: string;
  image?: string | null;
  brand?: { name: string } | null;
  category?: { id: string; name: string } | null;
  createdAt: string;
}

const STORE_URL = ""; // storefront is the same app

const EMPTY_FORM = {
  name: "", sku: "", price: "", mrp: "", boxPrice: "", boxQuantity: "", hsnCode: "", stockQuantity: "0",
  brandId: "", categoryId: "", description: "", shortDescription: "",
  images: "", attributes: "", tags: "",
  isFeatured: false, isNew: false, isBestSeller: false, status: "active",
};

export default function AdminProducts() {
  const router = useRouter();
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [brands, setBrands] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState("");
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [csv, setCsv] = useState("");

  useEffect(() => {
    if (!getToken()) return router.push("/admin/login");
  }, []);

  const load = async (pageNum = page, search = q) => {
    try {
      const d = await api(`/admin/products?page=${pageNum}&pageSize=15${search ? `&q=${encodeURIComponent(search)}` : ""}`);
      setRows(d.items);
      setTotal(d.total);
      setPage(d.page);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    load();
    api("/admin/brands").then(setBrands).catch(() => {});
    api("/admin/categories").then(setCategories).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNew = () => {
    setEditId("");
    setForm(EMPTY_FORM);
    setMsg("");
    setShowForm(true);
  };

  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm({
      name: p.name, sku: p.sku, price: p.price, mrp: p.mrp ?? "",
      boxPrice: p.boxPrice ?? "", boxQuantity: p.boxQuantity ? String(p.boxQuantity) : "", hsnCode: p.hsnCode ?? "",
      stockQuantity: String(p.stockQuantity),
      brandId: p.brand?.id ?? "", categoryId: p.category?.id ?? "",
      description: p.description ?? "", shortDescription: p.shortDescription ?? "",
      images: (p.images ?? []).map((i: any) => i.url).join("\n"),
      attributes: (p.attributes ?? []).map((a: any) => `${a.name}: ${a.value}`).join("\n"),
      tags: (p.tags ?? []).join(", "),
      isFeatured: p.isFeatured, isNew: p.isNew, isBestSeller: p.isBestSeller, status: p.status,
    });
    setMsg("");
    setShowForm(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const payload = {
        name: form.name,
        sku: form.sku || undefined,
        price: Number(form.price),
        mrp: form.mrp ? Number(form.mrp) : undefined,
        boxPrice: form.boxPrice ? Number(form.boxPrice) : null,
        boxQuantity: form.boxQuantity ? Number(form.boxQuantity) : null,
        hsnCode: form.hsnCode || null,
        stockQuantity: Number(form.stockQuantity),
        brandId: form.brandId || null,
        categoryId: form.categoryId || null,
        description: form.description || undefined,
        shortDescription: form.shortDescription || undefined,
        images: form.images.split("\n").map((s: string) => s.trim()).filter(Boolean),
        attributes: form.attributes.split("\n").map((l: string) => { const [n, ...v] = l.split(":"); return { name: n.trim(), value: v.join(":").trim() }; }).filter((a: any) => a.name),
        tags: form.tags.split(",").map((s: string) => s.trim()).filter(Boolean),
        isFeatured: form.isFeatured,
        isNew: form.isNew,
        isBestSeller: form.isBestSeller,
        status: form.status,
      };
      if (editId) await api(`/admin/products/${editId}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api("/admin/products", { method: "POST", body: JSON.stringify(payload) });
      setShowForm(false);
      load();
    } catch (err: any) {
      setMsg(err.message);
    }
    setSaving(false);
  };

  const del = async (id: string) => {
    if (!window.confirm("Delete this product?")) return;
    await api(`/admin/products/${id}`, { method: "DELETE" });
    load();
  };

  const doImport = async () => {
    const res = await fetch(`${API_URL}/admin/products/import`, {
      method: "POST",
      headers: { "Content-Type": "text/csv", Authorization: `Bearer ${getToken()}` },
      body: csv,
    });
    const j = await res.json();
    setMsg(j.success ? `Imported: ${j.data.created} created, ${j.data.updated} updated, ${j.data.failed} failed` : j.error?.message);
  };

  return (
    <div>
      <div className="between mb-16">
        <h2 style={{ margin: 0 }}>Products ({total})</h2>
        <div className="flex">
          <button className="btn sm secondary" onClick={() => setImportOpen(!importOpen)}>CSV Import</button>
          <button className="btn sm" onClick={openNew}>+ Add Product</button>
        </div>
      </div>

      {importOpen && (
        <div className="panel mb-16">
          <h3>Bulk CSV Import</h3>
          <p className="small muted">Columns: name, sku, price, mrp, boxPrice, boxQuantity, hsnCode, stockQuantity, description, brand, category (headers required)</p>
          <textarea className="textarea" rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"name,sku,price,mrp,boxPrice,boxQuantity,hsnCode,stockQuantity,brand,category\nExample LCD,SKU-X1,1200,1600,1050,10,8524,50,Xiaomi,mobile-display"} />
          <button className="btn sm mt-8" onClick={doImport}>Import</button>
        </div>
      )}

      <div className="flex mb-16">
        <input className="input" style={{ maxWidth: 340 }} placeholder="Search by name or SKU…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(1, q)} />
        <button className="btn sm" onClick={() => load(1, q)}>Search</button>
      </div>

      {msg && <div className="alert success">{msg}</div>}

      <div className="panel" style={{ padding: 0, overflow: "auto" }}>
        <table className="table">
          <thead>
            <tr><th></th><th>Product</th><th>SKU</th><th>Brand</th><th>Price</th><th>MRP</th><th>Stock</th><th>Flags</th><th>Status</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <img
                    src={p.image ?? "https://placehold.co/80x80/e9ecef/6c757d?text=No+Image"}
                    alt=""
                    width={40}
                    height={40}
                    style={{ objectFit: "cover", borderRadius: 6, display: "block" }}
                  />
                </td>
                <td style={{ maxWidth: 260 }}>
                  <a href={`${STORE_URL}/products/${p.id}`} target="_blank" rel="noreferrer" title="View on storefront">
                    {p.name} ↗
                  </a>
                </td>
                <td className="small muted">{p.sku}</td>
                <td>{p.brand?.name ?? "—"}</td>
                <td>
                  <strong>{fmt(p.price)}</strong>
                  {p.boxPrice && p.boxQuantity && (
                    <div className="small muted">box {fmt(p.boxPrice)}/ {p.boxQuantity}+</div>
                  )}
                </td>
                <td className="muted">{p.mrp ? fmt(p.mrp) : "—"}</td>
                <td><span className={`pill ${p.stockStatus}`}>{p.stockQuantity}</span></td>
                <td className="small">
                  {p.isFeatured && "⭐ "}{p.isNew && "🆕 "}{p.isBestSeller && "🔥"}
                </td>
                <td><span className={`pill ${p.status === "active" ? "active" : "inactive"}`}>{p.status}</span></td>
                <td className="small muted">{fmtDate(p.createdAt)}</td>
                <td>
                  <div className="flex">
                    <button className="btn sm secondary" onClick={() => openEdit(p)}>Edit</button>
                    <button className="btn sm danger" onClick={() => del(p.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty-state">No products found</div>}
      </div>

      {total > 15 && (
        <div className="flex mt-16" style={{ justifyContent: "center" }}>
          {page > 1 && <button className="btn sm secondary" onClick={() => load(page - 1)}>← Prev</button>}
          <span className="small muted" style={{ alignSelf: "center" }}>Page {page} of {Math.ceil(total / 15)}</span>
          {page * 15 < total && <button className="btn sm secondary" onClick={() => load(page + 1)}>Next →</button>}
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h3>{editId ? "Edit Product" : "Add Product"}</h3>
            {msg && <div className="form-error">{msg}</div>}
            <label className="label">Name *</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="form-row">
              <div>
                <label className="label">SKU (auto if empty)</label>
                <input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div>
                <label className="label">Brand</label>
                <select className="select" value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
                  <option value="">— None —</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div>
                <label className="label">Category</label>
                <select className="select" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">— None —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="form-row-3">
              <div>
                <label className="label">Price (₹) *</label>
                <input className="input" type="number" min={0} required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div>
                <label className="label">MRP (₹)</label>
                <input className="input" type="number" min={0} value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} />
              </div>
              <div>
                <label className="label">Stock</label>
                <input className="input" type="number" min={0} value={form.stockQuantity} onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })} />
              </div>
            </div>
            <div className="form-row-3">
              <div>
                <label className="label">Bulk (Box) Price ₹</label>
                <input className="input" type="number" min={0} placeholder="e.g. 1280" value={form.boxPrice} onChange={(e) => setForm({ ...form, boxPrice: e.target.value })} />
              </div>
              <div>
                <label className="label">Box Qty Threshold</label>
                <input className="input" type="number" min={1} placeholder="e.g. 10" value={form.boxQuantity} onChange={(e) => setForm({ ...form, boxQuantity: e.target.value })} />
              </div>
              <div>
                <label className="label">GST HSN Code</label>
                <input className="input" placeholder="e.g. 8524" maxLength={16} value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} />
              </div>
            </div>
            {form.boxPrice && form.boxQuantity && (
              <div className="small muted" style={{ marginTop: 6 }}>
                💰 Bulk rate {fmt(form.boxPrice)}/pc applies when buying {form.boxQuantity}+ pcs
              </div>
            )}
            <label className="label">Short Description</label>
            <input className="input" value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} />
            <label className="label">Description</label>
            <textarea className="textarea" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <label className="label">Image URLs (one per line)</label>
            <textarea className="textarea" rows={2} value={form.images} onChange={(e) => setForm({ ...form, images: e.target.value })} />
            <label className="label">Specifications ("Name: value" per line)</label>
            <textarea className="textarea" rows={2} value={form.attributes} onChange={(e) => setForm({ ...form, attributes: e.target.value })} />
            <label className="label">Tags (comma separated)</label>
            <input className="input" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            <div className="flex mt-16 wrap">
              <label className="flex"><input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} /> Featured</label>
              <label className="flex"><input type="checkbox" checked={form.isNew} onChange={(e) => setForm({ ...form, isNew: e.target.checked })} /> New arrival</label>
              <label className="flex"><input type="checkbox" checked={form.isBestSeller} onChange={(e) => setForm({ ...form, isBestSeller: e.target.checked })} /> Best seller</label>
            </div>
            <div className="flex mt-16">
              <button className="btn" type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              <button className="btn secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
