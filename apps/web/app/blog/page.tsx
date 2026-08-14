"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export default function BlogPage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [cat, setCat] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [d, c] = await Promise.all([api("/blog?pageSize=30"), api("/blog/categories")]);
        setPosts(d.items);
        setCats(c);
      } catch { /* ignore */ }
    })();
  }, []);

  const filtered = cat ? posts.filter((p) => p.category === cat) : posts;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Blog & Guides</h1>
      <div className="flex wrap gap-8 mb-16">
        <button className={`btn sm ${cat === "" ? "" : "secondary"}`} onClick={() => setCat("")}>All</button>
        {cats.map((c) => (
          <button key={c} className={`btn sm ${cat === c ? "" : "secondary"}`} onClick={() => setCat(cat === c ? "" : c)}>{c}</button>
        ))}
      </div>
      <div className="tile-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {filtered.map((p) => (
          <Link key={p.id} href={`/blog/${p.slug}`} className="card" style={{ display: "block", padding: 0 }}>
            {p.featuredImage && <img src={p.featuredImage} alt={p.title} style={{ width: "100%", height: 160, objectFit: "cover" }} />}
            <div className="card-body">
              <div className="small muted">{p.category} · {p.publishedAt ? fmtDate(p.publishedAt) : ""}</div>
              <div className="card-name">{p.title}</div>
              {p.excerpt && <p className="small muted" style={{ margin: 0 }}>{p.excerpt.slice(0, 100)}…</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
