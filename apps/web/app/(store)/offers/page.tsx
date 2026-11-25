"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { inr } from "@/lib/format";

export default function OffersPage() {
  const [data, setData] = useState<any>({ banners: [], coupons: [] });

  useEffect(() => {
    api("/offers").then(setData).catch(() => {});
  }, []);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Offers & Coupons</h1>

      {data.banners.length > 0 && (
        <section className="section">
          <div className="tile-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {data.banners.map((b: any) => (
              <Link key={b.id} href={b.linkUrl ?? "/products"} className="card" style={{ padding: 0, display: "block" }}>
                <img src={b.imageUrl} alt={b.title ?? "Offer"} style={{ width: "100%", height: 160, objectFit: "cover" }} />
                <div className="card-body">
                  <div className="card-name">{b.title}</div>
                  {b.subtitle && <div className="muted small">{b.subtitle}</div>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2>Active Coupon Codes</h2>
        <div className="tile-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {data.coupons.map((c: any) => (
            <div key={c.id} className="panel">
              <div className="between">
                <strong style={{ fontSize: 18, letterSpacing: 1, color: "var(--primary)" }}>{c.code}</strong>
                <span className="pill delivered">
                  {c.type === "percentage" ? `${Number(c.value)}% off` : `${inr(c.value)} off`}
                </span>
              </div>
              <p className="small muted" style={{ margin: "10px 0 0" }}>
                {c.description ?? "Valid on eligible orders."}
                {Number(c.minOrderAmount) > 0 && <> Min order {inr(c.minOrderAmount)}.</>}
              </p>
              <Link href="/products" className="btn sm secondary mt-8">Shop Now</Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
