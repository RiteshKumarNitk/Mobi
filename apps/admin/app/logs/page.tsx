"use client";

import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function LogsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!getToken()) return router.push("/login");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (p = page) => {
    try {
      const d = await api(`/admin/logs?page=${p}&pageSize=30`);
      setRows(d.items);
      setTotal(d.total);
      setPage(d.page);
    } catch { /* ignore */ }
  };

  const exportLogs = async () => {
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"}/admin/logs/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "activity-logs.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="between mb-16">
        <h2 style={{ margin: 0 }}>Activity Logs ({total})</h2>
        <button className="btn sm secondary" onClick={exportLogs}>Export JSON</button>
      </div>
      <div className="panel" style={{ padding: 0, overflow: "auto" }}>
        <table className="table">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="small muted">{new Date(l.createdAt).toLocaleString()}</td>
                <td>{l.user ?? "system"}</td>
                <td><span className="pill active">{l.action}</span></td>
                <td className="small">{l.entityType ?? "—"}{l.entityId ? ` · ${l.entityId.slice(0, 8)}` : ""}</td>
                <td className="small muted" style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {l.newData ? JSON.stringify(l.newData).slice(0, 120) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty-state">No activity yet</div>}
      </div>
      {total > 30 && (
        <div className="flex mt-16" style={{ justifyContent: "center" }}>
          {page > 1 && <button className="btn sm secondary" onClick={() => load(page - 1)}>← Prev</button>}
          <span className="small muted" style={{ alignSelf: "center" }}>Page {page} of {Math.ceil(total / 30)}</span>
          {page * 30 < total && <button className="btn sm secondary" onClick={() => load(page + 1)}>Next →</button>}
        </div>
      )}
    </div>
  );
}
