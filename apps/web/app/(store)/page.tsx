"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { getRecentIds } from "@/lib/recentlyViewed";
import ProductCard, { type ProductShape } from "@/components/ProductCard";

export default function Home() {
  const [banners, setBanners] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [featured, setFeatured] = useState<ProductShape[]>([]);
  const [trending, setTrending] = useState<ProductShape[]>([]);
  const [newArrivals, setNewArrivals] = useState<ProductShape[]>([]);
  const [recent, setRecent] = useState<ProductShape[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [slide, setSlide] = useState(0);
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    // Each section renders as soon as its own data arrives, instead of the
    // whole page waiting for the slowest request. A failed section stays empty.
    const load = <T,>(path: string, apply: (data: T) => void) =>
      api<T>(path).then(apply).catch(() => {});
    load<any[]>("/banners/active", (b) => setBanners(b.filter((x: any) => x.type === "homepage")));
    load<any[]>("/categories", (c) => setCategories(c.filter((x: any) => !x.parentId)));
    load<ProductShape[]>("/products/featured", setFeatured);
    load<ProductShape[]>("/products/trending", setTrending);
    load<ProductShape[]>("/products/new", setNewArrivals);
    load<any[]>("/brands", setBrands);
    load<any>("/offers", (o) => setOffers(o.banners ?? []));
    (async () => {
      // Recently viewed products (from this browser), kept in viewing order.
      const recentIds = getRecentIds();
      if (recentIds.length) {
        try {
          const d: any = await api(`/products?ids=${recentIds.join(",")}`);
          const byId = new Map((d.items ?? []).map((p: any) => [p.id, p]));
          setRecent(recentIds.map((rid) => byId.get(rid)).filter((p): p is ProductShape => Boolean(p)));
        } catch {
          /* ignore */
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (banners.length < 2) return;
    // No auto-rotation for users who asked the OS for reduced motion.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [banners.length]);

  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/newsletter/subscribe", { method: "POST", body: JSON.stringify({ email }) });
      setSubscribed(true);
    } catch {
      /* ignore */
    }
  };

  const row = (title: string, items: ProductShape[], link?: string) =>
    items.length ? (
      <section className="section">
        <div className="section-head">
          <h2>{title}</h2>
          {link && <Link href={link}>View all →</Link>}
        </div>
        <div className="product-grid">{items.map((p) => <ProductCard key={p.id} product={p} />)}</div>
      </section>
    ) : null;

  return (
    <>
      {banners.length > 0 && (
        <section className="hero">
          <div className="hero-slide">
            <img src={banners[slide].imageUrl} alt={banners[slide].title ?? ""} />
            <div className="hero-content">
              <h1>{banners[slide].title ?? "Mobile Spare Parts at Wholesale Prices"}</h1>
              <p>{banners[slide].subtitle ?? "Displays, batteries, chargers & more - B2B rates for shops and retailers."}</p>
              <Link href={banners[slide].linkUrl ?? "/products"} className="btn accent">
                Shop Now
              </Link>
            </div>
          </div>
          <div className="hero-dots">
            {banners.map((_, i) => (
              <button key={i} className={`hero-dot ${i === slide ? "active" : ""}`} onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}`} />
            ))}
          </div>
        </section>
      )}

      {categories.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Shop by Category</h2>
            <Link href="/categories">All categories →</Link>
          </div>
          <div className="tile-grid">
            {categories.slice(0, 8).map((c) => (
              <Link key={c.id} href={`/products?categoryId=${c.id}`} className="tile">
                {c.imageUrl && <img src={c.imageUrl} alt={c.name} />}
                <div className="t-name">{c.name}</div>
                <div className="t-count">{c._count?.products ?? 0} parts</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {row("Recently Viewed", recent, "/products")}
      {row("Featured Products", featured, "/products?featured=true")}
      {row("Trending Now", trending, "/products?isBestSeller=true")}
      {row("New Arrivals", newArrivals, "/products?isNew=true")}

      {brands.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Shop by Brand</h2>
            <Link href="/brands">All brands →</Link>
          </div>
          <div className="tile-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
            {brands.map((b) => (
              <Link key={b.id} href={`/products?brandId=${b.id}`} className="tile">
                {b.logoUrl ? (
                  <img src={b.logoUrl} alt={b.name} />
                ) : (
                  <div className="t-avatar">{b.name.slice(0, 1)}</div>
                )}
                <div className="t-name">{b.name}</div>
                <div className="t-count">{b._count?.products ?? 0} parts</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {offers.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Special Offers</h2>
            <Link href="/offers">View all offers →</Link>
          </div>
          <div className="product-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {offers.map((o) => (
              <Link key={o.id} href={o.linkUrl ?? "/offers"} className="card" style={{ padding: 0 }}>
                <img src={o.imageUrl} alt={o.title ?? "Offer"} style={{ width: "100%", height: 160, objectFit: "cover" }} />
                <div className="card-body">
                  <div className="card-name">{o.title}</div>
                  {o.subtitle && <div className="muted small">{o.subtitle}</div>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="panel center" style={{ padding: "36px 24px" }}>
          <h2>Why Choose Baba Communication?</h2>
          <div className="tile-grid mt-16" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            {[
              ["🚚", "Fast Dispatch", "Orders shipped within 24 hours"],
              ["💰", "B2B Pricing", "Wholesale rates for shops & retailers"],
              ["✅", "Quality Tested", "Every part checked before dispatch"],
              ["🛡️", "6 Month Warranty", "On displays and batteries"],
              ["💬", "Expert Support", "Help choosing the right part"],
            ].map(([icon, t, d]) => (
              <div key={t}>
                <div style={{ fontSize: 28 }}>{icon}</div>
                <h3 style={{ fontSize: 16, margin: "8px 0 4px" }}>{t}</h3>
                <div className="muted small">{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="panel center" style={{ padding: "32px 24px", background: "var(--primary)", color: "#fff", border: "none" }}>
          <h2 style={{ marginTop: 0 }}>Subscribe for Wholesale Deals</h2>
          <p className="muted" style={{ color: "rgba(255,255,255,0.85)" }}>
            Get new arrivals, stock alerts and exclusive B2B offers in your inbox.
          </p>
          {subscribed ? (
            <div className="alert success" style={{ maxWidth: 420, margin: "0 auto" }}>✅ Subscribed! Watch your inbox for deals.</div>
          ) : (
            <form onSubmit={subscribe} className="flex" style={{ maxWidth: 460, margin: "0 auto", gap: 8 }}>
              <input
                type="email"
                required
                className="input"
                placeholder="you@your-shop.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="btn accent" type="submit">Subscribe</button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
