"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, fmt, fmtDateTime, getToken, setToken } from "@/lib/api";

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    api("/admin/dashboard")
      .then(setData)
      .catch((err: any) => {
        if (err?.status === 401) {
          setToken(null);
          router.push("/login");
        } else {
          setError(err?.message ?? "Failed to load dashboard");
        }
      });
  }, [router]);

  if (error) return <div className="center muted" style={{ padding: 80 }}>{error}</div>;
  if (!data) return <div className="center muted" style={{ padding: 80 }}>Loading dashboard…</div>;

  const m = data.metrics;
  const maxRevenue = Math.max(...data.salesTrend.map((d: any) => d.revenue), 1);

  const stats: [string, string, string][] = [
    ["🧾", fmt(m.revenueToday), `Revenue today · ${fmt(m.revenueMonth)} this month`],
    ["📦", String(m.ordersToday), `Orders today · ${m.pendingOrders} pending`],
    ["🗃", String(m.productsInStock), `${m.lowStock} low stock · ${m.totalProducts} total`],
    ["👥", String(m.customers), "Customers"],
    ["🔄", String(m.totalOrders), "Total orders"],
  ];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Dashboard</h2>

      <div className="stat-grid">
        {stats.map(([icon, value, label]) => (
          <div key={label} className="stat-card">
            <div style={{ fontSize: 20 }}>{icon}</div>
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex wrap mb-16">
        <Link href="/products" className="btn sm">+ Add Product</Link>
        <Link href="/orders" className="btn sm secondary">View Orders</Link>
        <Link href="/banners" className="btn sm secondary">Create Offer</Link>
        <Link href="/customers" className="btn sm secondary">Add Customer</Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, alignItems: "start" }} className="dash-cols">
        <div>
          <div className="panel mb-16">
            <h3>Sales - Last 30 Days</h3>
            {data.salesTrend.map((d: any) => (
              <div key={d.date} className="bar-row">
                <span className="bar-label">{d.date.slice(5)}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.max(2, (d.revenue / maxRevenue) * 100)}%` }} />
                </div>
                <span className="small muted" style={{ width: 80 }}>{fmt(d.revenue)}</span>
              </div>
            ))}
          </div>

          <div className="panel">
            <h3>Top Selling Products (30 days)</h3>
            {data.topProducts.length === 0 && <div className="muted small">No sales yet in the last 30 days.</div>}
            <table className="table">
              <thead><tr><th>Product</th><th>Qty</th><th>Revenue</th></tr></thead>
              <tbody>
                {data.topProducts.map((p: any) => (
                  <tr key={p.name}><td>{p.name}</td><td>{p.qty}</td><td>{fmt(p.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="panel mb-16">
            <h3>Order Status</h3>
            {data.statusDistribution.map((s: any) => (
              <div key={s.status} className="between" style={{ padding: "4px 0" }}>
                <span className={`pill ${s.status}`}>{s.status}</span>
                <strong>{s.count}</strong>
              </div>
            ))}
          </div>

          <div className="panel mb-16">
            <h3>Recent Orders</h3>
            {data.recentOrders.map((o: any) => (
              <Link key={o.id} href={`/orders?q=${o.orderNumber}`} className="between" style={{ padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                <span>{o.orderNumber}<br /><span className="small muted">{o.customer}</span></span>
                <span><span className={`pill ${o.status}`}>{o.status}</span><br /><strong>{fmt(o.total)}</strong></span>
              </Link>
            ))}
          </div>

          <div className="panel">
            <h3>New Customers</h3>
            {data.recentCustomers.map((c: any) => (
              <div key={c.id} className="between" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <span>{c.name}<br /><span className="small muted">{c.shopName ?? c.phone}</span></span>
                <span className="small muted">{fmtDateTime(c.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
