"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useStore();
  const [form, setForm] = useState({ name: "", phone: "", email: "", shopName: "", gstNumber: "", password: "", confirm: "" });
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");
  const [debugCode, setDebugCode] = useState("");
  const [error, setError] = useState("");
  const [agree, setAgree] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) return setError("Passwords do not match");
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) return setError("Password must be at least 8 characters with letters and numbers");
    if (!agree) return setError("Please accept the Terms & Conditions");
    try {
      const data = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name: form.name, phone: form.phone, email: form.email || undefined, shopName: form.shopName || undefined, gstNumber: form.gstNumber || undefined, password: form.password }),
      });
      setDebugCode(data.debugCode ?? "");
      setOtpSent(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const data = await api("/otp/verify", {
        method: "POST",
        body: JSON.stringify({ phone: form.phone, purpose: "register", code }),
      });
      login(data.accessToken, data.user, data.refreshToken);
      router.push("/account");
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (otpSent) {
    return (
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <div className="panel">
          <h1 style={{ marginTop: 0 }}>Verify OTP</h1>
          <p className="muted small">We sent a 6-digit code to <strong>+91 {form.phone}</strong>. It expires in 5 minutes.</p>
          {debugCode && <div className="alert warn small">Your verification code is <strong>{debugCode}</strong></div>}
          {error && <div className="form-error">{error}</div>}
          <form onSubmit={verify}>
            <label className="label" htmlFor="reg-otp">Enter OTP</label>
            <input id="reg-otp" inputMode="numeric" autoComplete="one-time-code" className="input" style={{ fontSize: 22, letterSpacing: 8, textAlign: "center" }} maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="••••••" />
            <button className="btn block mt-16" type="submit">Verify & Activate Account</button>
          </form>
          <div className="center small mt-16">
            Wrong number? <button className="btn sm secondary" onClick={() => setOtpSent(false)}>Change number</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 460, margin: "0 auto" }}>
      <div className="panel">
        <h1 style={{ marginTop: 0 }}>Create Account</h1>
        <p className="muted small">Register with your shop details to unlock B2B wholesale pricing.</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <form onSubmit={register}>
          <label className="label" htmlFor="reg-name">Full Name *</label>
          <input id="reg-name" autoComplete="name" className="input" value={form.name} onChange={(e) => set("name", e.target.value)} required />
          <div className="form-row">
            <div>
              <label className="label" htmlFor="reg-phone">Phone Number *</label>
              <input id="reg-phone" inputMode="numeric" autoComplete="tel" className="input" value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} placeholder="10-digit" required />
            </div>
            <div>
              <label className="label" htmlFor="reg-email">Email</label>
              <input id="reg-email" autoComplete="email" className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label className="label" htmlFor="reg-shop">Shop Name</label>
              <input id="reg-shop" autoComplete="organization" className="input" value={form.shopName} onChange={(e) => set("shopName", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="reg-gst">GST Number</label>
              <input id="reg-gst" className="input" value={form.gstNumber} onChange={(e) => set("gstNumber", e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label className="label" htmlFor="reg-password">Password *</label>
              <input id="reg-password" autoComplete="new-password" className="input" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required />
              <div className="small muted">{form.password.length < 8 ? "Min 8 characters, letters + numbers" : form.password.length < 10 ? "🟡 Fair" : "🟢 Strong"}</div>
            </div>
            <div>
              <label className="label" htmlFor="reg-confirm">Confirm Password *</label>
              <input id="reg-confirm" autoComplete="new-password" className="input" type="password" value={form.confirm} onChange={(e) => set("confirm", e.target.value)} required />
            </div>
          </div>
          <label style={{ display: "flex", gap: 8, marginTop: 16, fontSize: 13, alignItems: "flex-start" }}>
            <input id="reg-agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I agree to the <Link href="/page/terms">Terms &amp; Conditions</Link> and <Link href="/page/privacy">Privacy Policy</Link>.</span>
          </label>
          <button className="btn block mt-16" type="submit">Register & Get OTP</button>
        </form>
        <div className="center small mt-16">Already have an account? <Link href="/login">Login</Link></div>
      </div>
    </div>
  );
}
