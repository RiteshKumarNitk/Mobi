"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function ContactPage() {
  const [info, setInfo] = useState<any>({});
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/company-info").then(setInfo).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api("/contact", { method: "POST", body: JSON.stringify(form) });
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }} className="cart-cols">
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Get in Touch</h2>
        {sent ? (
          <div className="alert success">✅ Message sent! We'll reply within 24 hours (Mon-Sat).</div>
        ) : (
          <form onSubmit={submit}>
            {error && <div className="form-error">{error}</div>}
            <div className="form-row">
              <div><label className="label">Name *</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <label className="label">Email *</label>
            <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <label className="label">Subject</label>
            <input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            <label className="label">Message *</label>
            <textarea className="textarea" rows={4} required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            <button className="btn block mt-16" type="submit">Send Message</button>
          </form>
        )}
      </div>
      <div>
        <div className="panel mb-16">
          <h3>Business Address</h3>
          <p className="muted" style={{ margin: 0 }}>{info.address ?? "Loading…"}</p>
        </div>
        <div className="panel mb-16">
          <h3>Contact</h3>
          <p className="muted" style={{ margin: 0 }}>
            📞 <a href={`tel:${info.phone?.replace(/\s/g, "")}`}>{info.phone}</a><br />
            ✉️ <a href={`mailto:${info.email}`}>{info.email}</a><br />
            🕐 {info.businessHours}
          </p>
        </div>
        <div className="panel">
          <h3>Business Hours</h3>
          <p className="muted" style={{ margin: 0 }}>
            Monday - Saturday: 10:00 AM - 7:00 PM<br />
            Sunday: Closed
          </p>
        </div>
      </div>
    </div>
  );
}
