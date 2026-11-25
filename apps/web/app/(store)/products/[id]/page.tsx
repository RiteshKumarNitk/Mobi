"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { discountPct, fmtDate, inr } from "@/lib/format";
import { pushRecentId } from "@/lib/recentlyViewed";
import ProductCard, { type ProductShape } from "@/components/ProductCard";

interface ReviewShape {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  helpfulCount: number;
  createdAt: string;
  user: { name: string; shopName?: string | null };
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const { addToCart, toggleWishlist, wishlist, user } = useStore();
  const [product, setProduct] = useState<any>(null);
  const [related, setRelated] = useState<ProductShape[]>([]);
  const [reviews, setReviews] = useState<ReviewShape[]>([]);
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const [added, setAdded] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewMsg, setReviewMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [p, r, rv] = await Promise.all([
          api(`/products/${id}`),
          api(`/products/${id}/related`),
          api(`/products/${id}/reviews`),
        ]);
        setProduct(p);
        setRelated(r);
        setReviews(rv.reviews ?? []);
        pushRecentId(String(id));
      } catch {
        /* not found */
      }
    })();
  }, [id]);

  if (!product) {
    return <div className="center muted" style={{ padding: 80 }}>Loading product…</div>;
  }

  const pct = discountPct(product.price, product.mrp);
  const outOfStock = product.stockQuantity <= 0;
  const inWishlist = wishlist.includes(product.id);
  const share = (net: string) => window.open(net, "_blank");
  const hasBulk = product.boxPrice != null && product.boxQuantity != null;
  const bulkApplies = hasBulk && qty >= Number(product.boxQuantity);
  const unitPrice = bulkApplies ? Number(product.boxPrice) : Number(product.price);

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api(`/products/${id}/reviews`, { method: "POST", body: JSON.stringify({ rating, comment }) });
      setReviewMsg("Review submitted. It will appear after approval.");
      setComment("");
    } catch (err: any) {
      setReviewMsg(err.message);
    }
  };

  return (
    <div>
      <div className="small muted mb-16">
        <Link href="/products">Products</Link> / {product.brand?.name} / {product.name}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36, alignItems: "start" }} className="product-detail-grid">
        {/* Gallery */}
        <div>
          <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
            <img src={product.gallery?.[activeImg]?.url ?? product.image} alt={product.name} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
          </div>
          {(product.gallery?.length ?? 0) > 1 && (
            <div className="gap-8 mt-8">
              {product.gallery.map((g: any, i: number) => (
                <button key={i} onClick={() => setActiveImg(i)} style={{ border: i === activeImg ? "2px solid var(--primary)" : "1px solid var(--border)", borderRadius: 6, padding: 2, cursor: "pointer", background: "#fff" }}>
                  <img src={g.url} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 4 }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          {product.brand && <div className="card-brand" style={{ fontSize: 13 }}>{product.brand.name}</div>}
          <h1 style={{ fontSize: 24, margin: "6px 0 8px" }}>{product.name}</h1>
          <div className="small muted mb-16">
            SKU: {product.sku} · Category: <Link href={`/products?categoryId=${product.category?.id}`}>{product.category?.name}</Link>
            {product.rating > 0 && <> · ⭐ {product.rating.toFixed(1)} ({product.reviewCount} reviews)</>}
          </div>

          <div className="flex wrap gap-8 mb-8" style={{ alignItems: "baseline" }}>
            <span className="price" style={{ fontSize: 28 }}>{inr(bulkApplies ? product.boxPrice : product.price)}</span>
            {product.mrp && <span className="mrp" style={{ fontSize: 16 }}>{inr(product.mrp)}</span>}
            {pct && <span className="discount" style={{ fontSize: 15 }}>{pct}% off</span>}
          </div>
          {hasBulk && (
            <div className={`bulk-hint ${bulkApplies ? "applied" : ""}`} style={{ marginBottom: 12 }}>
              📦 {bulkApplies ? (
                <>Bulk rate applied — <strong>{inr(product.boxPrice)}</strong>/pc for {qty}+ pcs</>
              ) : (
                <>Buy <strong>{Number(product.boxQuantity) - qty}+ more</strong> ({qty}/{product.boxQuantity}) to unlock box price <strong>{inr(product.boxPrice)}</strong>/pc</>
              )}
            </div>
          )}

          <div className={`stock-badge ${outOfStock ? "out" : product.stockQuantity < 10 ? "low" : "in"}`} style={{ fontSize: 14 }}>
            {outOfStock ? "✕ Out of stock" : product.stockQuantity < 10 ? `⚠ Only ${product.stockQuantity} left in stock` : "✓ In stock - dispatch within 24 hours"}
          </div>

          {product.shortDescription && <p className="muted">{product.shortDescription}</p>}

          <div className="flex gap-8 mt-16" style={{ alignItems: "center" }}>
            <div className="flex" style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <button className="btn sm secondary" style={{ borderRadius: 0 }} onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
              <span style={{ minWidth: 44, textAlign: "center", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{qty}</span>
              <button className="btn sm secondary" style={{ borderRadius: 0 }} onClick={() => setQty(Math.min(product.stockQuantity || 99, qty + 1))}>+</button>
            </div>
            <button
              className="btn"
              style={{ flex: 1, padding: "12px" }}
              disabled={outOfStock}
              onClick={async () => {
                await addToCart(product.id, qty);
                setAdded(true);
                setTimeout(() => setAdded(false), 1500);
              }}
            >
              {added ? "✓ Added to cart" : outOfStock ? "Out of stock" : bulkApplies ? `Add ${qty} pcs at ${inr(unitPrice)}` : "Add to Cart"}
            </button>
            <button className={`wishlist-btn ${inWishlist ? "active" : ""}`} style={{ position: "static", width: 44, height: 44, fontSize: 20 }} onClick={() => toggleWishlist(product.id)}>
              {inWishlist ? "♥" : "♡"}
            </button>
          </div>

          <div className="gap-8 mt-16 small">
            <span className="muted">Share:</span>
            <a href="#" onClick={(e) => { e.preventDefault(); share(`https://wa.me/?text=${encodeURIComponent(`${product.name} - ${inr(product.price)} at Baba Communication`)}`); }}>WhatsApp</a>
            <a href="#" onClick={(e) => { e.preventDefault(); share(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`); }}>Facebook</a>
            <a href="#" onClick={(e) => { e.preventDefault(); share(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${product.name} - ${inr(product.price)}`)}`); }}>X</a>
          </div>
        </div>
      </div>

      {/* Description + specs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 36 }} className="detail-cols">
        <div className="panel">
          <h3>Description</h3>
          <p className="muted">{product.description ?? "No description available."}</p>
          {product.tags?.length > 0 && (
            <div className="gap-8 wrap small">
              {product.tags.map((t: string) => <span key={t} className="pill processing">{t}</span>)}
            </div>
          )}
        </div>
        {product.attributes?.length > 0 && (
          <div className="panel">
            <h3>Technical Specifications</h3>
            <table className="table">
              <tbody>
                {product.attributes.map((a: any, i: number) => (
                  <tr key={i}><td style={{ fontWeight: 600, width: "40%" }}>{a.name}</td><td>{a.value}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reviews */}
      <section className="section mt-24">
        <h2>Customer Reviews ({reviews.length})</h2>
        {user ? (
          <form onSubmit={submitReview} className="panel mb-16">
            <div className="gap-8 mb-16" style={{ alignItems: "center" }}>
              <span className="small">Your rating:</span>
              {[1, 2, 3, 4, 5].map((r) => (
                <button key={r} type="button" onClick={() => setRating(r)} style={{ fontSize: 22, background: "none", border: "none", cursor: "pointer", color: r <= rating ? "var(--warning)" : "#ccc" }}>★</button>
              ))}
            </div>
            <textarea className="textarea" rows={3} placeholder="Share your experience with this part…" value={comment} onChange={(e) => setComment(e.target.value)} />
            <button className="btn sm mt-8" type="submit">Submit review</button>
            {reviewMsg && <div className="form-success mt-8">{reviewMsg}</div>}
          </form>
        ) : (
          <div className="alert info mb-16"><Link href={`/login?next=/products/${product.id}`}>Login</Link> to write a review.</div>
        )}
        {reviews.length === 0 && <div className="empty-state"><h3>No reviews yet</h3><p>Be the first to review this product.</p></div>}
        {reviews.map((r) => (
          <div key={r.id} className="panel mb-16">
            <div className="between">
              <div>
                <strong>{r.user.name}</strong> {r.user.shopName && <span className="muted small">({r.user.shopName})</span>}
              </div>
              <span className="small muted">{fmtDate(r.createdAt)}</span>
            </div>
            <div style={{ color: "var(--warning)", fontSize: 16 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</div>
            {r.title && <strong>{r.title}</strong>}
            {r.comment && <p className="muted" style={{ margin: "6px 0 0" }}>{r.comment}</p>}
            <div className="small muted mt-8">👍 {r.helpfulCount} found this helpful</div>
          </div>
        ))}
      </section>

      {related.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Related Products</h2></div>
          <div className="product-grid">{related.map((p) => <ProductCard key={p.id} product={p} />)}</div>
        </section>
      )}
    </div>
  );
}
