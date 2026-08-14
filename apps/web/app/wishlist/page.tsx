"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import ProductCard, { type ProductShape } from "@/components/ProductCard";

export default function WishlistPage() {
  const { user, addToCart, toggleWishlist } = useStore();
  const [items, setItems] = useState<{ product: ProductShape }[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const data = await api("/wishlist");
        setItems(data);
      } catch {
        /* ignore */
      }
    })();
  }, [user, items.length === 0]);

  if (!user) {
    return (
      <div className="empty-state">
        <h3>Login to see your wishlist</h3>
        <Link href="/login?next=/wishlist" className="btn">Login</Link>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="empty-state">
        <h3>Your wishlist is empty</h3>
        <p>Tap the ♡ icon on any product to save it here.</p>
        <Link href="/products" className="btn">Browse Products</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>My Wishlist ({items.length})</h1>
      <div className="product-grid">
        {items.map(({ product }) => (
          <div key={product.id} style={{ position: "relative" }}>
            <ProductCard product={product} />
            <button className="btn sm secondary" style={{ width: "100%", marginTop: 8 }} onClick={() => { addToCart(product.id); toggleWishlist(product.id); }}>
              Move to Cart
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
