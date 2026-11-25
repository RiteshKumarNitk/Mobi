"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, getToken, setToken } from "@/lib/adminApi";

const NAV = [
  ["/admin", "📊", "Dashboard"],
  ["/admin/products", "📦", "Products"],
  ["/admin/inventory", "🗃", "Inventory"],
  ["/admin/orders", "🧾", "Orders"],
  ["/admin/returns", "↩", "Returns"],
  ["/admin/customers", "👥", "Customers"],
  ["/admin/coupons", "🎟", "Coupons"],
  ["/admin/banners", "🖼", "Banners & Offers"],
  ["/admin/faqs", "❓", "FAQs"],
  ["/admin/pages", "📄", "Pages (CMS)"],
  ["/admin/settings", "⚙️", "Settings"],
  ["/admin/roles", "🔐", "Roles"],
  ["/admin/logs", "📜", "Activity Logs"],
];

const LOGIN = "/admin/login";
const ADMIN_ROLES = ["super_admin", "admin", "manager", "staff"];
/** Sections the API restricts to super_admin/admin. */
const OWNER_ONLY = new Set(["/admin/settings", "/admin/roles", "/admin/logs"]);
const OWNER_ROLES = ["super_admin", "admin"];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (pathname === LOGIN) return;
    if (!getToken()) {
      router.replace(LOGIN);
      return;
    }
    api("/auth/me")
      .then((d: any) => {
        const u = d?.user;
        if (!u || !ADMIN_ROLES.includes(u.role)) {
          setToken(null);
          router.replace(LOGIN);
          return;
        }
        setUser(u);
      })
      .catch(() => {
        setToken(null);
        router.replace(LOGIN);
      })
      .finally(() => setChecked(true));
  }, [pathname, router]);

  if (pathname === LOGIN) return <>{children}</>;

  // Block the shell until the stored session has been validated, so a stale
  // token never flashes admin content.
  if (!checked) {
    return <div className="center muted" style={{ padding: 80 }}>Checking session…</div>;
  }

  const logout = () => {
    setToken(null);
    router.push(LOGIN);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 230,
          background: "#1b2a41",
          color: "#cbd5e1",
          padding: "18px 0",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "auto",
          flexShrink: 0,
        }}
      >
        <div style={{ padding: "0 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)", marginBottom: 12 }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>Baba<span style={{ color: "#28a745" }}>Comm</span></div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Admin Panel</div>
        </div>
        <nav>
          {NAV.filter(([href]) => !OWNER_ONLY.has(href) || OWNER_ROLES.includes(user?.role)).map(([href, icon, label]) => (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                gap: 10,
                padding: "10px 20px",
                color: pathname === href ? "#fff" : "#cbd5e1",
                background: pathname === href ? "rgba(0,123,255,0.25)" : "transparent",
                borderLeft: pathname === href ? "3px solid #007bff" : "3px solid transparent",
                fontSize: 14,
              }}
            >
              <span>{icon}</span> {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div style={{ flex: 1, padding: "24px 28px", background: "#f4f6f9", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div className="small muted">
            {user ? `${user.firstName ?? "Admin"} · ${user.role}` : ""}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <a href="/" className="btn sm secondary">Open Store</a>
            <button className="btn sm danger" onClick={logout}>Logout</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
