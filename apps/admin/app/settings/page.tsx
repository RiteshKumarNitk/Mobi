"use client";

import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";
import { useRouter } from "next/navigation";

const GROUPS = ["general", "shipping", "payment", "email", "notification"];

export default function SettingsPage() {
  const router = useRouter();
  const [group, setGroup] = useState("general");
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [keys, setKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!getToken()) return router.push("/login");
  }, []);

  const load = async (g = group) => {
    try {
      const d = await api(`/admin/settings/${g}`);
      setValues(d);
      setKeys(Object.keys(d));
      setGroup(g);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api(`/admin/settings/${group}`, { method: "PUT", body: JSON.stringify({ values }) });
      setMsg("Settings saved");
      load();
    } catch (err: any) {
      setMsg(err.message);
    }
  };

  const addKey = () => {
    const k = window.prompt("New setting key (e.g. shipping_flat_rate):");
    if (k && !keys.includes(k)) {
      setKeys([...keys, k]);
      setValues({ ...values, [k]: "" });
    }
  };

  const removeKey = (k: string) => {
    setKeys(keys.filter((x) => x !== k));
    const next = { ...values };
    delete next[k];
    setValues(next);
  };

  const hints: Record<string, string[]> = {
    general: ["company_name", "company_address", "company_phone", "company_email", "gst_number", "business_hours", "low_stock_threshold"],
    shipping: ["shipping_flat_rate", "shipping_free_threshold"],
    payment: ["cod_enabled", "razorpay_enabled", "currency"],
    email: ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "from_email"],
    notification: ["sms_gateway", "sms_api_key", "whatsapp_enabled"],
  };

  return (
    <div>
      <div className="between mb-16">
        <h2 style={{ margin: 0 }}>System Settings</h2>
        <div className="flex">
          {GROUPS.map((g) => (
            <button key={g} className={`btn sm ${group === g ? "" : "secondary"}`} onClick={() => load(g)}>{g}</button>
          ))}
        </div>
      </div>
      {msg && <div className="alert success">{msg}</div>}

      <form className="panel" style={{ maxWidth: 640 }} onSubmit={save}>
        <h3>{group} settings</h3>
        {keys.length === 0 && <div className="alert info">No settings in this group yet — add some below.</div>}
        {keys.map((k) => (
          <div key={k} className="flex" style={{ alignItems: "center", marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="label">{k}</label>
              <input className="input" value={values[k] ?? ""} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
            </div>
            <button type="button" className="btn sm danger mt-16" onClick={() => removeKey(k)}>✕</button>
          </div>
        ))}
        <div className="flex mt-16">
          <button className="btn" type="submit">Save Settings</button>
          <button className="btn secondary" type="button" onClick={addKey}>+ Add Key</button>
        </div>
        {hints[group] && (
          <div className="alert info mt-16">
            <strong>Common keys:</strong> {hints[group].join(", ")}
          </div>
        )}
      </form>
    </div>
  );
}
