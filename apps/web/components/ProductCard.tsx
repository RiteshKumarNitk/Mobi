"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { discountPct, inr } from "@/lib/format";

export interface ProductShape {
  id: string;
  name: string;
  sku: string;
  slug?: string;
  price: string;
  mrp: string | null;
  boxPrice?: string | null;
  boxQuantity?: number | null;
  stockQuantity: number;
  stockStatus: string;
  isFeatured?: boolean;
  isNew?: boolean;
  isBestSeller?: boolean;
  image: string | null;
  brand?: { id: string; name: string; slug: string } | null;
}

export default function ProductCard({ product, view = "grid" }: { product: ProductShape; view?: "grid" | "list" }) {
  const { addToCart, toggleWishlist, wishlist, user } = useStore();
  const pct = discountPct(product.price, product.mrp);
  const inWishlist = wishlist.includes(product.id);
  const outOfStock = product.stockQuantity <= 0;

  return (
    <div className="card" style={view === "list" ? { flexDirection: "row" } : undefined}>
      {product.isNew && <span className="badge new">New</span>}
      {pct && !product.isNew && <span className="badge sale">-{pct}%</span>}
      {product.isBestSeller && !pct && !product.isNew && <span className="badge best">Best Seller</span>}
      <button
        className={`wishlist-btn ${inWishlist ? "active" : ""}`}
        title={user ? "Add to wishlist" : "Login to use wishlist"}
        onClick={() => toggleWishlist(product.id)}
        aria-label="Toggle wishlist"
      >
        {inWishlist ? "♥" : "♡"}
      </button>
      <Link href={`/products/${product.id}`} style={{ display: "block" }}>
        <img src={product.image ?? "https://placehold.co/600x600/e9ecef/6c757d?text=No+Image"} alt={product.name} className="card-img" loading="lazy" />
      </Link>
      <div className="card-body">
        {product.brand && <div className="card-brand">{product.brand.name}</div>}
        <Link href={`/products/${product.id}`} className="card-name">
          {product.name}
        </Link>
        <div className="card-price">
          <span className="price">{inr(product.price)}</span>
          {product.mrp && <span className="mrp">{inr(product.mrp)}</span>}
          {pct && <span className="discount">{pct}% off</span>}
        </div>
        <div className={`stock-badge ${outOfStock ? "out" : product.stockQuantity < 10 ? "low" : "in"}`}>
          {outOfStock ? "Out of stock" : product.stockQuantity < 10 ? `Only ${product.stockQuantity} left` : "In stock"}
        </div>
        {product.boxPrice && product.boxQuantity && (
          <div className="bulk-hint" title={`Buy ${product.boxQuantity}+ pcs at ${inr(product.boxPrice)} each`}>
            📦 Bulk: <strong>{inr(product.boxPrice)}</strong>/pc at {product.boxQuantity}+ pcs
          </div>
        )}
        <div className="card-actions">
          <button className="btn sm" disabled={outOfStock} onClick={() => addToCart(product.id)}>
            Add to cart
          </button>
        </div>
      </div>
    </div>
  );
}
