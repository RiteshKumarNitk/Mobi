"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, safeNext } from "@/lib/api";
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
  const [busy, setBusy] = useState(false);
  // Unverified phone: the API asks for an OTP before the first login.
  const [otpStep, setOtpStep] = useState(false);
  const [code, setCode] = useState("");
  const [debugCode, setDebugCode] = useState("");

  const next = safeNext(params.get("next"));

  const finish = (data: any) => {
    login(data.accessToken, data.user, data.refreshToken);
    router.push(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      finish(await api("/auth/login", { method: "POST", body: JSON.stringify({ phone, password }) }));
    } catch (err: any) {
      if (err.code === "OTP_REQUIRED") {
        try {
          const sent = await api("/otp/send", { method: "POST", body: JSON.stringify({ phone, purpose: "register" }) });
          setDebugCode(sent.debugCode ?? "");
          setOtpStep(true);
        } catch (e2: any) {
          setError(e2.message);
        }
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      finish(await api("/otp/verify", { method: "POST", body: JSON.stringify({ phone, purpose: "register", code }) }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (otpStep) {
    return (
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <div className="panel">
          <h1 style={{ marginTop: 0 }}>Verify your number</h1>
          <p className="muted small">Enter the 6-digit code sent to <strong>+91 {phone}</strong>. It expires in 5 minutes.</p>
          {debugCode && <div className="alert warn small">Your verification code is <strong>{debugCode}</strong></div>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <form onSubmit={verify}>
            <label className="label" htmlFor="otp">OTP</label>
            <input id="otp" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
            <button className="btn block mt-16" type="submit" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify & Login"}</button>
          </form>
          <div className="center small mt-16">
            <button className="btn sm secondary" type="button" onClick={() => setOtpStep(false)}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <div className="panel">
        <h1 style={{ marginTop: 0 }}>Login</h1>
        <p className="muted small">Login with your phone number. B2B wholesale pricing is available to verified shops.</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <form onSubmit={submit}>
          <label className="label" htmlFor="phone">Phone Number</label>
          <input id="phone" className="input" inputMode="numeric" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="10-digit mobile number" required />
          <label className="label" htmlFor="password">Password</label>
          <div style={{ position: "relative" }}>
            <input id="password" className="input" type={showPw ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" required />
            <button
              type="button"
              aria-label={showPw ? "Hide password" : "Show password"}
              onClick={() => setShowPw(!showPw)}
              style={{ position: "absolute", right: 10, top: 9, border: "none", background: "none", cursor: "pointer" }}
            >
              {showPw ? "🙈" : "👁"}
            </button>
          </div>
          <div className="between mt-8 small">
            <span />
            <Link href="/forgot-password">Forgot password?</Link>
          </div>
          <button className="btn block mt-16" type="submit" disabled={busy}>{busy ? "Signing in…" : "Login"}</button>
        </form>
        <div className="center small mt-16">
          New customer? <Link href="/register">Create an account</Link>
        </div>
      </div>
    </div>
  );
}
