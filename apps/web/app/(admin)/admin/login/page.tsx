"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, setToken } from "@/lib/adminApi";

const ADMIN_ROLES = ["super_admin", "admin", "manager", "staff"];

export default function AdminLogin() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Already signed in? Skip the login form.
  useEffect(() => {
    if (getToken()) router.replace("/admin");
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("Enter a valid 10-digit phone number");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setBusy(true);
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone: digits, password }),
      });
      if (!data.user || !ADMIN_ROLES.includes(data.user.role)) {
        setError("This account is not an admin account");
        return;
      }
      setToken(data.accessToken, data.refreshToken);
      router.replace("/admin");
    } catch (err: any) {
      setError(err?.message ?? "Login failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1b2a41" }}>
      <div style={{ width: 400 }}>
        <div style={{ textAlign: "center", color: "#fff", marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 24 }}>Baba<span style={{ color: "#28a745" }}>Comm</span></div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>Admin Panel</div>
        </div>
        <div className="panel">
          <h3>Admin Login</h3>
          {error && <div className="form-error">{error}</div>}
          <form onSubmit={submit} noValidate>
            <label className="label">Phone</label>
            <input
              className="input"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              autoComplete="username"
              required
            />
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button className="btn block mt-16" type="submit" disabled={busy}>
              {busy ? "Logging in…" : "Login"}
            </button>
          </form>
          {(process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO_MODE === "true") && (
            <div className="center small muted mt-16">Demo admin login: 9999999999 / Admin@123</div>
          )}
        </div>
      </div>
    </div>
  );
}
