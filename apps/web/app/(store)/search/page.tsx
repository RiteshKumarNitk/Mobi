"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import ProductCard, { type ProductShape } from "@/components/ProductCard";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="center muted" style={{ padding: 80 }}>Loading…</div>}>
      <SearchInner />
    </Suspense>
  );
}

function SearchInner() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const [items, setItems] = useState<ProductShape[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!q) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api(`/search?q=${encodeURIComponent(q)}&pageSize=50`)
      .then((d) => {
        setItems(d.items);
        setTotal(d.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Search Results{q ? ` for "${q}"` : ""}</h1>
      {loading ? (
        <div className="center muted" style={{ padding: 60 }}>Searching…</div>
      ) : !q ? (
        <div className="empty-state"><h3>Enter a search term</h3></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <h3>No products found</h3>
          <p>Try a different keyword, SKU or brand name.</p>
          <Link href="/products" className="btn">Browse all products</Link>
        </div>
      ) : (
        <>
          <p className="muted">{total} products found</p>
          <div className="product-grid">{items.map((p) => <ProductCard key={p.id} product={p} />)}</div>
        </>
      )}
    </div>
  );
}
