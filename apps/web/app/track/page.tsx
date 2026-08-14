"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

export default function TrackPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const track = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResult(null);
    try {
      setResult(await api(`/orders/track/${orderNumber.trim().toUpperCase()}`));
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Track Your Order</h1>
      <p className="muted">Enter your order number (e.g. BC-20260814ABC123) to see its status. No login needed.</p>
      <form onSubmit={track} className="flex mb-24" style={{ gap: 8 }}>
        <input className="input" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="Order number" required />
        <button className="btn" type="submit">Track</button>
      </form>
      {error && <div className="alert error">{error}</div>}
      {result && (
        <div className="panel">
          <div className="between mb-16">
            <strong>{result.orderNumber}</strong>
            <span className={`pill ${result.status}`}>{result.status}</span>
          </div>
          <ul className="timeline">
            {result.timeline.map((t: any, i: number) => (
              <li key={i} className={i === result.timeline.length - 1 ? "done" : ""}>
                <div className="t-title">{t.status}{t.notes ? ` — ${t.notes}` : ""}</div>
                <div className="t-time">{fmtDateTime(t.at)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
