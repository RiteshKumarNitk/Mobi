"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"send" | "reset" | "done">("send");
  const [code, setCode] = useState("");
  const [debugCode, setDebugCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const data = await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ phone }) });
      setDebugCode(data.debugCode ?? "");
      setStep("reset");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ phone, code, newPassword }) });
      setStep("done");
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (step === "done") {
    return (
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <div className="panel center">
          <h1>Password Updated ✅</h1>
          <p className="muted">You can now login with your new password.</p>
          <Link href="/login" className="btn">Go to Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: "0 auto" }}>
      <div className="panel">
        <h1 style={{ marginTop: 0 }}>Forgot Password</h1>
        {step === "send" ? (
          <form onSubmit={send}>
            <p className="muted small">Enter your registered phone number. We'll send a 6-digit OTP to reset your password.</p>
            {error && <div className="form-error">{error}</div>}
            <label className="label">Phone Number</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} required />
            <button className="btn block mt-16" type="submit">Send OTP</button>
          </form>
        ) : (
          <form onSubmit={reset}>
            {debugCode && <div className="alert warn small">Your verification code is <strong>{debugCode}</strong></div>}
            {error && <div className="form-error">{error}</div>}
            <label className="label">OTP</label>
            <input className="input" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
            <label className="label">New Password</label>
            <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} required />
            <button className="btn block mt-16" type="submit">Reset Password</button>
          </form>
        )}
        <div className="center small mt-16"><Link href="/login">← Back to login</Link></div>
      </div>
    </div>
  );
}
