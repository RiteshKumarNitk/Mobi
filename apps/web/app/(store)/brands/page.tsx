"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function BrandsPage() {
  const [brands, setBrands] = useState<any[]>([]);

  useEffect(() => {
    api("/brands").then(setBrands).catch(() => {});
  }, []);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Shop by Brand</h1>
      <div className="tile-grid">
        {brands.map((b) => (
          <Link key={b.id} href={`/products?brandId=${b.id}`} className="tile">
            {b.logoUrl ? (
              <img src={b.logoUrl} alt={b.name} />
            ) : (
              <div style={{ width: 72, height: 72, margin: "0 auto 10px", borderRadius: 6, background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800 }}>
                {b.name[0]}
              </div>
            )}
            <div className="t-name">{b.name}</div>
            <div className="t-count">{b._count?.products ?? 0} parts</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
