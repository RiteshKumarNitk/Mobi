"use client";

import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/adminApi";
import { useRouter } from "next/navigation";

export default function RolesPage() {
  const router = useRouter();
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", perms: [] as string[] });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!getToken()) return router.push("/admin/login");
    Promise.all([api("/admin/roles"), api("/admin/permissions")]).then(([r, p]) => {
      setRoles(r);
      setPermissions(p);
    }).catch(() => {});
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/admin/roles", { method: "POST", body: JSON.stringify({ name: form.name, description: form.description, permissions: form.perms }) });
      setShowForm(false);
      setMsg("Role created");
      setRoles(await api("/admin/roles"));
    } catch (err: any) {
      setMsg(err.message);
    }
  };

  return (
    <div>
      <div className="between mb-16">
        <h2 style={{ margin: 0 }}>Roles & Permissions</h2>
        <button className="btn sm" onClick={() => setShowForm(!showForm)}>+ Create Role</button>
      </div>
      {msg && <div className="alert success">{msg}</div>}

      {showForm && (
        <form className="panel mb-16" onSubmit={save}>
          <h3>Create Custom Role</h3>
          <div className="form-row">
            <div><label className="label">Role Name *</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">Description</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <label className="label">Permissions</label>
          <div className="flex wrap">
            {permissions.map((p) => (
              <label key={p.key} className="flex" style={{ width: "48%", padding: "4px 0" }}>
                <input
                  type="checkbox"
                  checked={form.perms.includes(p.key)}
                  onChange={(e) => setForm({ ...form, perms: e.target.checked ? [...form.perms, p.key] : form.perms.filter((x) => x !== p.key) })}
                />
                {p.label}
              </label>
            ))}
          </div>
          <div className="flex mt-16">
            <button className="btn" type="submit">Create</button>
            <button className="btn secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="panel" style={{ padding: 0 }}>
        <table className="table">
          <thead><tr><th>Role</th><th>Description</th><th>Permissions</th></tr></thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.name}</strong></td>
                <td className="small muted">{r.description}</td>
                <td className="small">
                  {Array.isArray(r.permissions) ? r.permissions.slice(0, 6).join(", ") + (r.permissions.length > 6 ? "…" : "") : JSON.stringify(r.permissions)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
