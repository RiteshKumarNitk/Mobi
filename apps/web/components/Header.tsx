"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import { inr } from "@/lib/format";

export default function Header() {
  const { cartCount, wishlist, user, logout } = useStore();
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState<{ products: any[]; categories: any[]; brands: any[] }>({ products: [], categories: [], brands: [] });
  const [showSuggest, setShowSuggest] = useState(false);
  const [cats, setCats] = useState<any[]>([]);
  const router = useRouter();
  const pathname = usePathname();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShowSuggest(false);
  }, [pathname]);

  // Categories for the mega-menu dropdown.
  useEffect(() => {
    api("/categories")
      .then((d) => setCats((d as any[]).filter((c) => !c.parentId)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowSuggest(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setSuggest({ products: [], categories: [], brands: [] });
      return;
    }
    const t = setTimeout(async () => {
      try {
        const data = await api(`/search/suggest?q=${encodeURIComponent(q.trim())}`);
        setSuggest(data);
        setShowSuggest(true);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <>
      <div className="topbar">
        <div className="container">
          <span>📞 +91 98765 43210 &nbsp;|&nbsp; Mon-Sat 10 AM - 7 PM</span>
          <span>
            B2B Platform for Repair Shops &amp; Retailers · <a href="mailto:sales@babacommunication.com">sales@babacommunication.com</a>
          </span>
        </div>
      </div>
      <header className="header">
        <div className="container">
          <div className="header-main">
            <Link href="/" className="logo">
              Baba<span>Comm</span>
              <div className="logo-sub">Mobile Spare Parts · B2B</div>
            </Link>
            <div className="search-wrap" ref={boxRef}>
              <form className="search-bar" onSubmit={submit}>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onFocus={() => suggest.products.length && setShowSuggest(true)}
                  placeholder="Search by product, SKU or brand…"
                />
                <button type="submit">Search</button>
              </form>
              {showSuggest && (
                <div className="suggestions">
                  {suggest.products.map((p) => (
                    <Link key={p.id} href={`/products/${p.id}`} className="suggestion-item" onClick={() => setShowSuggest(false)}>
                      <img src={p.image ?? ""} alt="" />
                      <div>
                        <div className="s-name">{p.name}</div>
                        <div className="s-price">{inr(p.price)}</div>
                      </div>
                    </Link>
                  ))}
                  {suggest.categories.map((c) => (
                    <Link key={c.id} href={`/products?categoryId=${c.id}`} className="suggestion-item" onClick={() => setShowSuggest(false)}>
                      <div className="s-name">📁 {c.name}</div>
                    </Link>
                  ))}
                  {suggest.brands.map((b) => (
                    <Link key={b.id} href={`/products?brandId=${b.id}`} className="suggestion-item" onClick={() => setShowSuggest(false)}>
                      <div className="s-name">🏷 {b.name}</div>
                    </Link>
                  ))}
                  {!suggest.products.length && !suggest.categories.length && !suggest.brands.length && (
                    <div className="suggestion-item muted small">No matches for “{q}”</div>
                  )}
                </div>
              )}
            </div>
            <div className="header-icons">
              <Link href="/wishlist" className="icon-link" title="Wishlist">
                ♡ <span className="icon-badge">{wishlist.length}</span>
              </Link>
              <Link href="/cart" className="icon-link" title="Cart">
                🛒 <span className="icon-badge">{cartCount}</span>
              </Link>
              {user ? (
                <Link href="/account" className="icon-link" title="My account">
                  👤 {user.firstName?.split(" ")[0] ?? user.phone.slice(-4)}
                </Link>
              ) : (
                <Link href="/login" className="icon-link" title="Login">
                  👤 Login
                </Link>
              )}
              {user && (
                <button
                  className="btn sm secondary"
                  onClick={() => {
                    logout();
                    router.push("/");
                  }}
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        </div>
        <nav className="nav">
          <div className="container">
            <Link href="/">Home</Link>
            <Link href="/products">All Products</Link>
            <Link href="/quick-order" className="nav-cta">⚡ Quick Order</Link>
            <div className="nav-item has-dropdown">
              <Link href="/categories">Categories ▾</Link>
              {cats.length > 0 && (
                <div className="dropdown">
                  {cats.map((c) => (
                    <div key={c.id} className="dropdown-group">
                      <Link href={`/products?categoryId=${c.id}`} className="dropdown-head">
                        {c.name}
                      </Link>
                      {(c.children ?? []).slice(0, 6).map((sub: any) => (
                        <Link key={sub.id} href={`/products?categoryId=${sub.id}`} className="dropdown-sub">
                          {sub.name}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Link href="/brands">Brands</Link>
            <Link href="/offers">Offers</Link>
            <Link href="/track">Track Order</Link>
            <Link href="/blog">Blog</Link>
            <Link href="/faqs">FAQs</Link>
            <Link href="/contact">Contact</Link>
          </div>
        </nav>
      </header>
    </>
  );
}
