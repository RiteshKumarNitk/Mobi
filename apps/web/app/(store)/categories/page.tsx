"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    api("/categories").then(setCategories).catch(() => {});
  }, []);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Browse Categories</h1>
      <div className="tile-grid">
        {categories.map((c) => (
          <div key={c.id} className="tile">
            <Link href={`/products?categoryId=${c.id}`} style={{ color: "inherit" }}>
              {c.imageUrl && <img src={c.imageUrl} alt={c.name} />}
              <div className="t-name">{c.name}</div>
              <div className="t-count">{c._count?.products ?? 0} parts</div>
            </Link>
            {c.children?.length > 0 && (
              <div className="small mt-8">
                {c.children.map((ch: any) => (
                  <Link key={ch.id} href={`/products?categoryId=${ch.id}`} style={{ display: "block", padding: "2px 0", color: "var(--text-light)" }}>
                    → {ch.name} ({ch._count?.products ?? 0})
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
