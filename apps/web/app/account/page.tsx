"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { fmtDate, inr } from "@/lib/format";

const TABS = ["orders", "addresses", "profile", "notifications"] as const;

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="center muted" style={{ padding: 80 }}>Loading…</div>}>
      <AccountInner />
    </Suspense>
  );
}

function AccountInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, logout } = useStore();
  const tab = (params.get("tab") as any) ?? "orders";
  const [orders, setOrders] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [profile, setProfile] = useState<any>({ firstName: "", lastName: "", email: "", shopName: "", gstNumber: "" });
  const [saved, setSaved] = useState(false);
  const [addrForm, setAddrForm] = useState<any>({});
  const [showAddrForm, setShowAddrForm] = useState(false);
  const [editAddrId, setEditAddrId] = useState("");

  const loadOrders = useCallback(async () => {
    try {
      const d = await api("/orders");
      setOrders(d.items);
    } catch { /* ignore */ }
  }, []);
  const loadAddresses = useCallback(async () => {
    try {
      setAddresses(await api("/customers/addresses"));
    } catch { /* ignore */ }
  }, []);
  const loadNotifications = useCallback(async () => {
    try {
      const d = await api("/notifications?pageSize=30");
      setNotifications(d.items);
      setUnread(d.unread);
    } catch { /* ignore */ }
  }, []);
  const loadProfile = useCallback(async () => {
    try {
      const d = await api("/customers/profile");
      setProfile({
        firstName: d.user.firstName ?? "",
        lastName: d.user.lastName ?? "",
        email: d.user.email ?? "",
        shopName: d.user.shopName ?? "",
        gstNumber: d.user.gstNumber ?? "",
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!user) {
      router.push("/login?next=/account");
      return;
    }
    if (tab === "orders") loadOrders();
    if (tab === "addresses") loadAddresses();
    if (tab === "profile") loadProfile();
    if (tab === "notifications") loadNotifications();
  }, [user, tab]);

  if (!user) return null;

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await api("/customers/profile", { method: "PUT", body: JSON.stringify(profile) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const saveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editAddrId) await api(`/customers/addresses/${editAddrId}`, { method: "PUT", body: JSON.stringify(addrForm) });
    else await api("/customers/addresses", { method: "POST", body: JSON.stringify(addrForm) });
    setShowAddrForm(false);
    setEditAddrId("");
    setAddrForm({});
    loadAddresses();
  };

  const markAllRead = async () => {
    await api("/notifications/mark-all-read", { method: "PUT" });
    loadNotifications();
  };

  return (
    <div>
      <div className="between mb-16">
        <h1 style={{ margin: 0 }}>
          Welcome, {user.firstName ?? user.phone} {user.shopName && <span className="muted small">· {user.shopName}</span>}
        </h1>
        <button className="btn sm secondary" onClick={() => { logout(); router.push("/"); }}>Logout</button>
      </div>

      <div className="flex wrap gap-8 mb-16">
        {TABS.map((t) => (
          <Link key={t} href={`/account?tab=${t}`} className={`btn sm ${tab === t ? "" : "secondary"}`}>
            {t === "notifications" ? `${t}${unread ? ` (${unread})` : ""}` : t[0].toUpperCase() + t.slice(1)}
          </Link>
        ))}
      </div>

      {tab === "orders" && (
        <div>
          {orders.length === 0 && (
            <div className="empty-state">
              <h3>No orders yet</h3>
              <Link href="/products" className="btn">Start Shopping</Link>
            </div>
          )}
          {orders.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="panel" style={{ display: "block", marginBottom: 12 }}>
              <div className="between wrap" style={{ gap: 8 }}>
                <div>
                  <strong>{o.orderNumber}</strong>
                  <div className="small muted">{fmtDate(o.createdAt)} · {o.itemsCount} item{o.itemsCount > 1 ? "s" : ""} · {o.firstItemName}</div>
                </div>
                <div className="gap-8" style={{ alignItems: "center" }}>
                  <span className="pill paid">{o.paymentStatus}</span>
                  <span className={`pill ${o.status}`}>{o.status}</span>
                  <strong>{inr(o.totalAmount)}</strong>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === "addresses" && (
        <div>
          {addresses.map((a) => (
            <div key={a.id} className="panel mb-16">
              <div className="between wrap" style={{ gap: 8 }}>
                <div>
                  <strong>{a.fullName}</strong> · {a.phone}
                  <div className="small muted">{a.addressLine1}{a.addressLine2 ? `, ${a.addressLine2}` : ""}, {a.city}, {a.state} - {a.pincode}</div>
                  <span className="pill pending">{a.addressType}</span> {a.isDefault && <span className="pill delivered">Default</span>}
                </div>
                <div className="gap-8 small">
                  <button
                    className="btn sm secondary"
                    onClick={async () => {
                      if (!a.isDefault) {
                        await api(`/customers/addresses/${a.id}/default`, { method: "PUT" });
                        loadAddresses();
                      }
                    }}
                  >
                    {a.isDefault ? "Default" : "Set default"}
                  </button>
                  <button className="btn sm secondary" onClick={() => { setEditAddrId(a.id); setAddrForm(a); setShowAddrForm(true); }}>Edit</button>
                  <button className="btn sm danger" onClick={async () => { await api(`/customers/addresses/${a.id}`, { method: "DELETE" }); loadAddresses(); }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
          {showAddrForm ? (
            <form className="panel" onSubmit={saveAddress}>
              <h3>{editAddrId ? "Edit Address" : "New Address"}</h3>
              <div className="form-row">
                <div><label className="label">Full Name</label><input className="input" required value={addrForm.fullName ?? ""} onChange={(e) => setAddrForm({ ...addrForm, fullName: e.target.value })} /></div>
                <div><label className="label">Phone</label><input className="input" required value={addrForm.phone ?? ""} onChange={(e) => setAddrForm({ ...addrForm, phone: e.target.value })} /></div>
              </div>
              <label className="label">Address Line 1</label>
              <input className="input" required value={addrForm.addressLine1 ?? ""} onChange={(e) => setAddrForm({ ...addrForm, addressLine1: e.target.value })} />
              <div className="form-row">
                <div><label className="label">City</label><input className="input" required value={addrForm.city ?? ""} onChange={(e) => setAddrForm({ ...addrForm, city: e.target.value })} /></div>
                <div><label className="label">State</label><input className="input" required value={addrForm.state ?? ""} onChange={(e) => setAddrForm({ ...addrForm, state: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div><label className="label">Pincode</label><input className="input" required value={addrForm.pincode ?? ""} onChange={(e) => setAddrForm({ ...addrForm, pincode: e.target.value })} /></div>
                <div><label className="label">Type</label>
                  <select className="select" value={addrForm.addressType ?? "Shop"} onChange={(e) => setAddrForm({ ...addrForm, addressType: e.target.value })}>
                    <option>Shop</option><option>Home</option><option>Other</option>
                  </select>
                </div>
              </div>
              <div className="gap-8 mt-16">
                <button className="btn accent" type="submit">Save</button>
                <button className="btn secondary" type="button" onClick={() => { setShowAddrForm(false); setEditAddrId(""); setAddrForm({}); }}>Cancel</button>
              </div>
            </form>
          ) : (
            <button className="btn" onClick={() => setShowAddrForm(true)}>+ Add New Address</button>
          )}
        </div>
      )}

      {tab === "profile" && (
        <form className="panel" style={{ maxWidth: 520 }} onSubmit={saveProfile}>
          <h3>Business Profile</h3>
          {saved && <div className="form-success">Profile updated</div>}
          <div className="form-row">
            <div><label className="label">First Name</label><input className="input" value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} /></div>
            <div><label className="label">Last Name</label><input className="input" value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} /></div>
          </div>
          <label className="label">Email</label>
          <input className="input" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
          <div className="form-row">
            <div><label className="label">Shop Name</label><input className="input" value={profile.shopName} onChange={(e) => setProfile({ ...profile, shopName: e.target.value })} /></div>
            <div><label className="label">GST Number</label><input className="input" value={profile.gstNumber} onChange={(e) => setProfile({ ...profile, gstNumber: e.target.value.toUpperCase() })} /></div>
          </div>
          <button className="btn mt-16" type="submit">Save Profile</button>
        </form>
      )}

      {tab === "notifications" && (
        <div>
          <div className="between mb-16">
            <span className="muted">{unread} unread</span>
            <button className="btn sm secondary" onClick={markAllRead}>Mark all read</button>
          </div>
          {notifications.length === 0 && <div className="empty-state"><h3>No notifications</h3></div>}
          {notifications.map((n) => (
            <div key={n.id} className={`panel mb-16 ${n.isRead ? "" : ""}`} style={n.isRead ? { opacity: 0.65 } : { borderColor: "var(--primary)" }}>
              <div className="between wrap" style={{ gap: 8 }}>
                <div>
                  <strong>{n.title ?? n.type}</strong>
                  <div className="small muted">{n.message}</div>
                </div>
                <span className="small muted">{fmtDate(n.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
