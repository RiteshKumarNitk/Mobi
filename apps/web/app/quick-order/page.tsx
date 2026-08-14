"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { inr } from "@/lib/format";

interface QuickResult {
  sku: string;
  found?: boolean;
  name?: string;
  quantity?: number;
  price?: string;
  error?: string;
  added?: boolean;
}

const SAMPLE = `SKU-SAM-0480-904 x10
SKU-XIA-0390-114 x5
SKU-INF-0980-678
SKU-NOT-A-REAL-ONE x2`;

function parseLines(raw: string): { sku: string; quantity: number }[] {
  const out: { sku: string; quantity: number }[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // Accept "SKU", "SKU x5", "SKU 5", "sku,5"
    const m = line.match(/^([A-Za-z0-9-]+)(?:\s*[xX,]\s*(\d+))?$/);
    if (!m) {
      out.push({ sku: line, quantity: 1 });
      continue;
    }
    out.push({ sku: m[1], quantity: m[2] ? parseInt(m[2], 10) : 1 });
  }
  return out;
}

export default function QuickOrderPage() {
  const [raw, setRaw] = useState("");
  const [results, setResults] = useState<QuickResult[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = parseLines(raw);
    if (!lines.length) return;
    setBusy(true);
    setResults(null);
    setSummary(null);
    try {
      const data = await api<{ message: string; added: number; results: QuickResult[] }>("/cart/quick-add", {
        method: "POST",
        body: JSON.stringify({ lines }),
      });
      setResults(data.results);
      setSummary(data.message);
    } catch (err: any) {
      setSummary(err.message);
    }
    setBusy(false);
  };

  const addedCount = results?.filter((r) => r.added).length ?? 0;
  const failedCount = results ? results.length - addedCount : 0;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>⚡ Quick Order</h1>
      <p className="muted">
        For shopkeepers in a hurry — paste your SKUs (one per line) and add everything to your cart in one click.
        Format: <code>SKU-CODE</code> or <code>SKU-CODE x10</code> for a quantity.
      </p>

      <form onSubmit={submit} className="panel">
        <label className="label">SKUs to order</label>
        <textarea
          className="textarea"
          rows={8}
          placeholder={SAMPLE}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          style={{ fontFamily: "monospace", fontSize: 14 }}
        />
        <div className="flex mt-16 wrap" style={{ gap: 8 }}>
          <button className="btn accent" type="submit" disabled={busy || !raw.trim()}>
            {busy ? "Adding to cart…" : "Add All to Cart"}
          </button>
          <button className="btn secondary" type="button" onClick={() => { setRaw(SAMPLE); setResults(null); setSummary(null); }}>
            Fill sample
          </button>
          <Link href="/cart" className="btn secondary">View Cart →</Link>
        </div>
      </form>

      {summary && <div className={`alert ${failedCount ? "info" : "success"} mt-16`}>{summary}</div>}

      {results && results.length > 0 && (
        <div className="panel mt-16" style={{ padding: 0, overflow: "auto" }}>
          <table className="table">
            <thead>
              <tr><th>SKU</th><th>Product</th><th style={{ textAlign: "right" }}>Qty</th><th style={{ textAlign: "right" }}>Rate</th><th>Status</th></tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: "monospace" }}>{r.sku}</td>
                  <td>{r.name ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>{r.quantity ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>{r.price ? inr(r.price) : "—"}</td>
                  <td>
                    {r.added ? <span className="pill active">Added ✓</span> : <span className="pill cancelled">{r.error ?? "Skipped"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel mt-16 small muted">
        <strong>Pro tip:</strong> Reorder a past order in seconds — open any past order, hit <strong>🔄 Reorder</strong>, and its SKUs
        land in your cart. Then use Quick Order to add more.
      </div>
    </div>
  );
}
