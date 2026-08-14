"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import ProductCard, { type ProductShape } from "@/components/ProductCard";

const SORTS = [
  ["newest", "Newest First"],
  ["price_asc", "Price: Low to High"],
  ["price_desc", "Price: High to Low"],
  ["best_selling", "Best Selling"],
  ["name_asc", "Name: A-Z"],
  ["name_desc", "Name: Z-A"],
];

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="center muted" style={{ padding: 80 }}>Loading…</div>}>
      <ProductsInner />
    </Suspense>
  );
}

function ProductsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [items, setItems] = useState<ProductShape[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);

  const q = params.get("q") ?? "";
  const categoryId = params.get("categoryId") ?? "";
  const brandId = params.get("brandId") ?? "";
  const minPrice = params.get("minPrice") ?? "";
  const maxPrice = params.get("maxPrice") ?? "";
  const stock = params.get("stock") ?? "";
  const sort = params.get("sort") ?? "newest";
  const page = Number(params.get("page") ?? "1");
  const featured = params.get("featured");
  const isNew = params.get("isNew");
  const isBestSeller = params.get("isBestSeller");

  useEffect(() => {
    (async () => {
      try {
        const [c, b] = await Promise.all([api("/categories"), api("/brands")]);
        setCategories(c);
        setBrands(b);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (categoryId) sp.set("categoryId", categoryId);
    if (brandId) sp.set("brandId", brandId);
    if (minPrice) sp.set("minPrice", minPrice);
    if (maxPrice) sp.set("maxPrice", maxPrice);
    if (stock) sp.set("stock", stock);
    sp.set("sort", sort);
    sp.set("page", String(page));
    if (featured) sp.set("featured", "true");
    if (isNew) sp.set("isNew", "true");
    if (isBestSeller) sp.set("isBestSeller", "true");
    try {
      const data = await api(`/products?${sp.toString()}`);
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [q, categoryId, brandId, minPrice, maxPrice, stock, sort, page, featured, isNew, isBestSeller]);

  useEffect(() => {
    load();
  }, [load]);

  const setParam = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    sp.delete("page");
    router.push(`/products?${sp.toString()}`);
  };

  const toggle = (key: string, value: string) => {
    const current = params.get(key) ?? "";
    const list = current ? current.split(",") : [];
    setParam(key, list.includes(value) ? list.filter((v) => v !== value).join(",") : [...list, value].join(","));
  };

  const checked = (key: string, value: string) => (params.get(key) ?? "").split(",").includes(value);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>{q ? `Results for "${q}"` : "All Products"}</h1>
      {q && <p className="muted">{total} products found</p>}

      <div style={{ display: "grid", gridTemplateColumns: "250px 1fr", gap: 20, alignItems: "start" }}>
        {/* Filters */}
        <aside className="panel" style={{ position: "sticky", top: 140 }}>
          <div className="between">
            <h3 style={{ margin: 0 }}>Filters</h3>
            <button className="btn sm secondary" onClick={() => router.push("/products")}>Clear</button>
          </div>

          <label className="label">Category</label>
          <div className="small">
            {categories.filter((c) => !c.parentId).map((c) => (
              <div key={c.id}>
                <label style={{ display: "flex", gap: 6, padding: "3px 0", alignItems: "center" }}>
                  <input type="checkbox" checked={checked("categoryId", c.id)} onChange={() => toggle("categoryId", c.id)} />
                  {c.name} ({c._count?.products ?? 0})
                </label>
                {(c.children ?? []).map((ch: any) => (
                  <label key={ch.id} style={{ display: "flex", gap: 6, padding: "2px 0 2px 20px", alignItems: "center" }}>
                    <input type="checkbox" checked={checked("categoryId", ch.id)} onChange={() => toggle("categoryId", ch.id)} />
                    {ch.name}
                  </label>
                ))}
              </div>
            ))}
          </div>

          <label className="label">Brand</label>
          <div className="small" style={{ maxHeight: 180, overflow: "auto" }}>
            {brands.map((b) => (
              <label key={b.id} style={{ display: "flex", gap: 6, padding: "3px 0", alignItems: "center" }}>
                <input type="checkbox" checked={checked("brandId", b.id)} onChange={() => toggle("brandId", b.id)} />
                {b.name} ({b._count?.products ?? 0})
              </label>
            ))}
          </div>

          <label className="label">Price Range (₹)</label>
          <div className="form-row">
            <input className="input" type="number" min={0} placeholder="Min" value={minPrice} onChange={(e) => setParam("minPrice", e.target.value)} />
            <input className="input" type="number" min={0} placeholder="Max" value={maxPrice} onChange={(e) => setParam("maxPrice", e.target.value)} />
          </div>

          <label className="label">Availability</label>
          <label style={{ display: "flex", gap: 6, padding: "3px 0", alignItems: "center" }} className="small">
            <input type="radio" name="stock" checked={stock === "in"} onChange={() => setParam("stock", stock === "in" ? "" : "in")} />
            In stock only
          </label>
        </aside>

        {/* Results */}
        <div>
          <div className="between mb-16">
            <div className="muted small">{total} products · page {page} of {Math.max(pages, 1)}</div>
            <div className="gap-8">
              <select className="select" style={{ width: 190 }} value={sort} onChange={(e) => setParam("sort", e.target.value)}>
                {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button className={`btn sm ${view === "grid" ? "" : "secondary"}`} onClick={() => setView("grid")} title="Grid view">⊞</button>
              <button className={`btn sm ${view === "list" ? "" : "secondary"}`} onClick={() => setView("list")} title="List view">☰</button>
            </div>
          </div>

          {loading ? (
            <div className="center muted" style={{ padding: 60 }}>Loading products…</div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <h3>No products found</h3>
              <p>Try adjusting your filters or search terms.</p>
              <button className="btn" onClick={() => router.push("/products")}>Clear filters</button>
            </div>
          ) : (
            <div className={`product-grid ${view === "list" ? "list" : ""}`}>
              {items.map((p) => <ProductCard key={p.id} product={p} view={view} />)}
            </div>
          )}

          {pages > 1 && (
            <div className="center mt-24 gap-8" style={{ justifyContent: "center" }}>
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 2)
                .map((p, idx, arr) => (
                  <span key={p} className="flex gap-8" style={{ gap: 8 }}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span className="muted">…</span>}
                    <button className={`btn sm ${p === page ? "" : "secondary"}`} onClick={() => setParam("page", String(p))}>
                      {p}
                    </button>
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
