"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<any>(null);

  useEffect(() => {
    api(`/blog/${slug}`).then(setPost).catch(() => {});
  }, [slug]);

  if (!post) return <div className="center muted" style={{ padding: 80 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="small muted mb-16"><Link href="/blog">← All posts</Link></div>
      <h1 style={{ margin: "0 0 8px" }}>{post.title}</h1>
      <div className="small muted mb-16">{post.category} · {post.publishedAt ? fmtDate(post.publishedAt) : ""} · 👁 {post.views} views</div>
      {post.featuredImage && <img src={post.featuredImage} alt={post.title} style={{ width: "100%", borderRadius: 12, marginBottom: 20 }} />}
      <div className="panel" dangerouslySetInnerHTML={{ __html: post.content ?? "" }} />
      <div className="flex wrap gap-8 mt-16">
        {Array.isArray(post.tags) && post.tags.map((t: string) => <span key={t} className="pill processing">#{t}</span>)}
      </div>
    </div>
  );
}
