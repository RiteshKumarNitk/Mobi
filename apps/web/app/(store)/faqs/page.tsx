"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function FaqsPage() {
  const [faqs, setFaqs] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCat, setActiveCat] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [f, c] = await Promise.all([api("/faqs"), api("/faqs/categories")]);
        setFaqs(f);
        setCategories(c);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const f = await api(`/faqs?${q ? `q=${encodeURIComponent(q)}` : ""}${activeCat ? `${q ? "&" : ""}category=${encodeURIComponent(activeCat)}` : ""}`);
        setFaqs(f);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [q, activeCat]);

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Frequently Asked Questions</h1>
      <input className="input mb-16" placeholder="Search FAQs…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex wrap gap-8 mb-16">
        <button className={`btn sm ${activeCat === "" ? "" : "secondary"}`} onClick={() => setActiveCat("")}>All</button>
        {categories.map((c) => (
          <button key={c} className={`btn sm ${activeCat === c ? "" : "secondary"}`} onClick={() => setActiveCat(activeCat === c ? "" : c)}>{c}</button>
        ))}
      </div>
      {faqs.map((f) => (
        <div key={f.id} className="accordion-item">
          <div className="accordion-q" onClick={() => setOpen(open === f.id ? null : f.id)}>
            <span>{f.question}</span>
            <span>{open === f.id ? "−" : "+"}</span>
          </div>
          {open === f.id && <div className="accordion-a">{f.answer}</div>}
        </div>
      ))}
      {!faqs.length && <div className="empty-state"><h3>No FAQs found</h3></div>}
    </div>
  );
}
