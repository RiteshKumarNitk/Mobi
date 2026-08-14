"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="center muted" style={{ padding: 80 }}>Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useStore();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ phone, password }) });
      login(data.accessToken, data.user);
      router.push(params.get("next") ?? "/account");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <div className="panel">
        <h1 style={{ marginTop: 0 }}>Login</h1>
        <p className="muted small">Login with your phone number. B2B wholesale pricing is available to verified shops.</p>
        {error && <div className="form-error">{error}</div>}
        <form onSubmit={submit}>
          <label className="label">Phone Number</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="10-digit mobile number" required />
          <label className="label">Password</label>
          <div style={{ position: "relative" }}>
            <input className="input" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" required />
            <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 10, top: 9, border: "none", background: "none", cursor: "pointer" }}>
              {showPw ? "🙈" : "👁"}
            </button>
          </div>
          <div className="between mt-8 small">
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" /> Remember me
            </label>
            <Link href="/forgot-password">Forgot password?</Link>
          </div>
          <button className="btn block mt-16" type="submit">Login</button>
        </form>
        <div className="center small mt-16">
          New customer? <Link href="/register">Create an account</Link>
        </div>
      </div>
      <div className="center small muted mt-16">
        Demo account: 8888888888 / Customer@123
      </div>
    </div>
  );
}
