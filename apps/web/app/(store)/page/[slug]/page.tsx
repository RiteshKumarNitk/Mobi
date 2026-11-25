"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

export default function StaticPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<any>(null);

  useEffect(() => {
    api(`/pages/${slug}`).then(setPage).catch(() => {});
  }, [slug]);

  if (!page) return <div className="center muted" style={{ padding: 80 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 780, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>{page.title}</h1>
      <div className="panel" dangerouslySetInnerHTML={{ __html: page.content ?? "" }} />
    </div>
  );
}
