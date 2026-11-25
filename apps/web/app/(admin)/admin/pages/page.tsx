"use client";

import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/adminApi";
import { useRouter } from "next/navigation";

export default function PagesPage() {
  const router = useRouter();
  const [pages, setPages] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [content, setContent] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!getToken()) return router.push("/admin/login");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    try {
      setPages(await api("/admin/pages"));
    } catch { /* ignore */ }
  };

  const open = (p: any) => {
    setEditing(p);
    setContent(p.content ?? "");
    setMsg("");
  };

  const save = async () => {
    try {
      await api(`/admin/pages/${editing.slug}`, { method: "PUT", body: JSON.stringify({ title: editing.title, content }) });
      setMsg("Page saved");
      load();
    } catch (err: any) {
      setMsg(err.message);
    }
  };

  return (
    <div>
      <div className="between mb-16">
        <h2 style={{ margin: 0 }}>Pages (CMS)</h2>
      </div>
      {msg && <div className="alert success">{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" }}>
        <div className="panel">
          <h3>Pages</h3>
          {pages.map((p) => (
            <div key={p.slug} className="between" style={{ padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
              <button className="btn sm secondary" onClick={() => open(p)}>{p.slug}</button>
              <span className={`pill ${p.status}`}>{p.status}</span>
            </div>
          ))}
        </div>

        <div className="panel">
          {editing ? (
            <>
              <h3>Edit: {editing.slug}</h3>
              <label className="label">Title</label>
              <input className="input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              <label className="label">Content (HTML supported)</label>
              <textarea className="textarea" rows={14} value={content} onChange={(e) => setContent(e.target.value)} />
              <div className="flex mt-16">
                <button className="btn" onClick={save}>Save Page</button>
                <a className="btn secondary" href={`/page/${editing.slug}`} target="_blank" rel="noreferrer">Preview ↗</a>
              </div>
            </>
          ) : (
            <div className="empty-state">Select a page from the left to edit its content.</div>
          )}
        </div>
      </div>
    </div>
  );
}
