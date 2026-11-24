import { defineRoute } from "@/lib/route";
import fs from "fs";
import path from "path";
import os from "os";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { Forbidden, NotFound } from "../../lib/errors";
import { paginate, round2 } from "../../lib/helpers";
import { adminRequired, can, OWNER_ROLES, requireRole } from "../../lib/auth";
import { BadRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { logActivity } from "../../lib/activity";
import { lowStockThreshold } from "../../lib/settings";

// Settings, roles, activity logs and backups are owner-only (super_admin/admin).
// Backups and logs contain customer PII; settings may hold integration secrets.
const ownerOnly = requireRole(...OWNER_ROLES);

/** Settings whose value feeds money/stock calculations must be valid numbers. */
const NUMERIC_SETTINGS = new Set(["shipping_flat_rate", "shipping_free_threshold", "low_stock_threshold", "tax_rate"]);

const SETTING_GROUPS = ["general", "payment", "shipping", "email", "notification"] as const;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

// GET /api/admin/settings
export const getSettings = defineRoute(
  adminRequired,
  ownerOnly,
  async (_req, res) => {
    const rows = await prisma.systemSetting.findMany();
    const grouped: Record<string, Record<string, string>> = {};
    for (const r of rows) {
      grouped[r.groupKey] = grouped[r.groupKey] ?? {};
      grouped[r.groupKey][r.key] = r.value ?? "";
    }
    return res.json({ success: true, data: grouped });
  }
);

// GET /api/admin/settings/:group
export const getSettingsGroup = defineRoute(
  adminRequired,
  ownerOnly,
  async (req, res) => {
    if (!SETTING_GROUPS.includes(req.params.group as any)) throw NotFound("Unknown settings group");
    const rows = await prisma.systemSetting.findMany({ where: { groupKey: req.params.group } });
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value ?? "";
    return res.json({ success: true, data: out });
  }
);

// PUT /api/admin/settings/:group
export const putSettingsGroup = defineRoute(
  adminRequired,
  ownerOnly,
  async (req, res) => {
    if (!SETTING_GROUPS.includes(req.params.group as any)) throw NotFound("Unknown settings group");
    const values = req.body?.values ?? req.body;
    if (typeof values !== "object" || values === null || Array.isArray(values)) throw BadRequest("Invalid settings payload");
    const entries = Object.entries(values);
    if (entries.length > 100) throw BadRequest("Too many settings in one request");
    for (const [key, value] of entries) {
      if (!/^[a-z0-9_]{1,64}$/.test(key)) throw BadRequest(`Invalid setting key "${key.slice(0, 64)}"`);
      if (typeof value === "object" && value !== null) throw BadRequest(`Setting "${key}" must be a plain value`);
      if (String(value ?? "").length > 5000) throw BadRequest(`Setting "${key}" is too long`);
      if (NUMERIC_SETTINGS.has(key)) {
        const n = Number(value);
        if (String(value).trim() === "" || !Number.isFinite(n) || n < 0) throw BadRequest(`Setting "${key}" must be a non-negative number`);
      }
    }
    for (const [key, value] of entries) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(value), groupKey: req.params.group },
        create: { key, value: String(value), groupKey: req.params.group },
      });
    }
    await logActivity(req, "settings.update", "settings", undefined, { newData: { group: req.params.group, keys: Object.keys(values) } });
    return res.json({ success: true, data: { message: "Settings updated" } });
  }
);

// ---------------------------------------------------------------------------
// Roles & permissions
// ---------------------------------------------------------------------------

const PERMISSION_CATALOG = [
  { key: "products.view", label: "View products" },
  { key: "products.edit", label: "Add / edit / delete products" },
  { key: "orders.view", label: "View orders" },
  { key: "orders.update", label: "Update order status" },
  { key: "customers.view", label: "View customers" },
  { key: "inventory.view", label: "View inventory" },
  { key: "inventory.update", label: "Update inventory" },
  { key: "reports.view", label: "View reports" },
  { key: "marketing.edit", label: "Manage coupons, offers & banners" },
  { key: "content.edit", label: "Manage CMS content" },
];

// GET /api/admin/permissions
export const getPermissions = defineRoute(
  adminRequired,
  async (_req, res) => {
    return res.json({ success: true, data: PERMISSION_CATALOG });
  }
);

// GET /api/admin/roles
export const getRoles = defineRoute(
  adminRequired,
  async (_req, res) => {
    const roles = await prisma.roleGroup.findMany({ orderBy: { createdAt: "asc" } });
    return res.json({ success: true, data: roles });
  }
);

// POST /api/admin/roles
const roleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().max(500).nullable().optional(),
  permissions: z.array(z.string().max(60)).max(50).optional(),
});

export const postRoles = defineRoute(
  adminRequired,
  ownerOnly,
  validate(roleSchema),
  async (req, res) => {
    const d = req.body;
    const created = await prisma.roleGroup.create({
      data: { name: d.name, description: d.description ?? null, permissions: d.permissions ?? [] },
    });
    await logActivity(req, "role.create", "role", created.id);
    return res.json({ success: true, data: created });
  }
);

// PUT /api/admin/roles/:id
export const putRolesId = defineRoute(
  adminRequired,
  ownerOnly,
  validate(roleSchema.partial()),
  async (req, res) => {
    const d = req.body;
    const data: any = {};
    if (d.name !== undefined) data.name = d.name;
    if (d.description !== undefined) data.description = d.description;
    if (d.permissions !== undefined) data.permissions = d.permissions;
    const updated = await prisma.roleGroup.update({ where: { id: req.params.id }, data });
    await logActivity(req, "role.update", "role", updated.id);
    return res.json({ success: true, data: updated });
  }
);

// DELETE /api/admin/roles/:id
export const deleteRolesId = defineRoute(
  adminRequired,
  ownerOnly,
  async (req, res) => {
    await prisma.roleGroup.delete({ where: { id: req.params.id } });
    await logActivity(req, "role.delete", "role", req.params.id);
    return res.json({ success: true, data: { message: "Role deleted" } });
  }
);

// ---------------------------------------------------------------------------
// Activity logs
// ---------------------------------------------------------------------------

// GET /api/admin/logs
export const getLogs = defineRoute(
  adminRequired,
  ownerOnly,
  async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const { q } = req.query;
    const where: any = {};
    if (q) where.action = { contains: String(q).slice(0, 100), mode: "insensitive" };
    const [total, items] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        include: { user: { select: { firstName: true, lastName: true, phone: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    return res.json({
      success: true,
      data: {
        items: items.map((l) => ({ ...l, user: l.user ? [l.user.firstName, l.user.lastName].filter(Boolean).join(" ") || l.user.phone : null })),
        total,
        page,
        pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  }
);

// GET /api/admin/logs/export
export const getLogsExport = defineRoute(
  adminRequired,
  ownerOnly,
  async (req, res) => {
    // Bounded export; user records are reduced to non-secret fields (never password hashes).
    const rows = await prisma.activityLog.findMany({
      include: { user: { select: { id: true, firstName: true, lastName: true, phone: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 50_000,
    });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=activity-logs.json");
    return res.send(JSON.stringify(rows, null, 2));
  }
);

// GET /api/admin/logs/:type
export const getLogsType = defineRoute(
  adminRequired,
  ownerOnly,
  async (req, res) => {
    const logs = await prisma.activityLog.findMany({
      where: { entityType: req.params.type },
      include: { user: { select: { id: true, firstName: true, lastName: true, phone: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return res.json({ success: true, data: logs });
  }
);

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

// GET /api/admin/reports/sales?from=&to=
export const getReportsSales = defineRoute(
  adminRequired,
  can("reports.view"),
  async (req, res) => {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { items: true },
    });
    const byDay = new Map<string, { revenue: number; orders: number; items: number }>();
    const productMap = new Map<string, { name: string; qty: number; revenue: number }>();
    const categoryMap = new Map<string, number>();
    const brandMap = new Map<string, number>();
    for (const o of orders) {
      const key = o.createdAt.toISOString().slice(0, 10);
      const e = byDay.get(key) ?? { revenue: 0, orders: 0, items: 0 };
      e.revenue += Number(o.totalAmount);
      e.orders += 1;
      byDay.set(key, e);
      for (const item of o.items) {
        e.items += item.quantity;
        const p = productMap.get(item.productName) ?? { name: item.productName, qty: 0, revenue: 0 };
        p.qty += item.quantity;
        p.revenue += Number(item.total);
        productMap.set(item.productName, p);
      }
    }
    const totalRevenue = orders.reduce((s, o) => s + Number(o.totalAmount), 0);
    const totalOrders = orders.length;
    return res.json({
      success: true,
      data: {
        period: { from, to },
        totals: { revenue: round2(totalRevenue).toString(), orders: totalOrders, avgOrderValue: totalOrders ? round2(totalRevenue / totalOrders).toString() : "0" },
        daily: [...byDay.entries()].sort().map(([date, v]) => ({ date, ...v, revenue: round2(v.revenue).toString() })),
        topProducts: [...productMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 10),
      },
    });
  }
);

// GET /api/admin/reports/inventory
export const getReportsInventory = defineRoute(
  adminRequired,
  can("reports.view"),
  async (_req, res) => {
    const threshold = await lowStockThreshold();
    const products = await prisma.product.findMany({ select: { id: true, name: true, sku: true, stockQuantity: true, costPrice: true, price: true, stockStatus: true } });
    const stockValue = products.reduce((s, p) => s + Number(p.costPrice ?? p.price) * p.stockQuantity, 0);
    return res.json({
      success: true,
      data: {
        threshold,
        totalProducts: products.length,
        inStock: products.filter((p) => p.stockQuantity > 0).length,
        outOfStock: products.filter((p) => p.stockQuantity === 0).length,
        lowStock: products.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= threshold).length,
        stockValue: round2(stockValue).toString(),
        lowStockItems: products.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= threshold),
      },
    });
  }
);

// GET /api/admin/reports/customers
export const getReportsCustomers = defineRoute(
  adminRequired,
  can("reports.view"),
  async (_req, res) => {
    const customers = await prisma.user.findMany({ where: { role: "customer" }, select: { id: true, firstName: true, lastName: true, phone: true, shopName: true, createdAt: true } });
    const orders = await prisma.order.findMany({ where: { userId: { in: customers.map((c) => c.id) } }, select: { userId: true, totalAmount: true, status: true } });
    const stats = new Map<string, { orders: number; revenue: number }>();
    for (const o of orders) {
      const e = stats.get(o.userId!) ?? { orders: 0, revenue: 0 };
      e.orders += 1;
      if (o.status !== "cancelled") e.revenue += Number(o.totalAmount);
      stats.set(o.userId!, e);
    }
    const rows = customers
      .map((c) => ({
        id: c.id,
        name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone,
        phone: c.phone,
        shopName: c.shopName,
        registeredAt: c.createdAt,
        orderCount: stats.get(c.id)?.orders ?? 0,
        totalSpent: round2(stats.get(c.id)?.revenue ?? 0).toString(),
      }))
      .sort((a, b) => Number(b.totalSpent) - Number(a.totalSpent));
    return res.json({ success: true, data: { totalCustomers: customers.length, topCustomers: rows.slice(0, 20) } });
  }
);

// GET /api/admin/reports/orders
export const getReportsOrders = defineRoute(
  adminRequired,
  can("reports.view"),
  async (_req, res) => {
    const statusCounts = await prisma.order.groupBy({ by: ["status"], _count: true });
    const total = await prisma.order.count();
    const cancelled = statusCounts.find((s) => s.status === "cancelled")?._count ?? 0;
    return res.json({
      success: true,
      data: {
        total,
        cancelled,
        cancellationRate: total ? round2((cancelled / total) * 100) : 0,
        byStatus: statusCounts.map((s) => ({ status: s.status, count: s._count })),
      },
    });
  }
);

// ---------------------------------------------------------------------------
// Backups (snapshot of core data to JSON files)
// ---------------------------------------------------------------------------

// Serverless hosts (Vercel) only allow writes under the OS temp dir; such backups are ephemeral.
const BACKUP_DIR = process.env.VERCEL ? path.join(os.tmpdir(), "baba-backups") : path.join(process.cwd(), "data", "backups");

/** Backup ids are generated by us; anything else (e.g. "../") is rejected to prevent path traversal. */
function backupFile(id: string): string {
  if (!/^backup-[0-9TZ-]{10,40}$/.test(id)) throw NotFound("Backup not found");
  return path.join(BACKUP_DIR, `${id}.json`);
}

function ensureBackupDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// GET /api/admin/backups
export const getBackups = defineRoute(
  adminRequired,
  ownerOnly,
  async (_req, res) => {
    ensureBackupDir();
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return { id: f.replace(/\.json$/, ""), name: f, size: stat.size, createdAt: stat.mtime };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return res.json({ success: true, data: files });
  }
);

// POST /api/admin/backups
export const postBackups = defineRoute(
  adminRequired,
  ownerOnly,
  async (req, res) => {
    ensureBackupDir();
    const name = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const [settings, pages, products, orders, categories, brands, coupons] = await Promise.all([
      prisma.systemSetting.findMany(),
      prisma.page.findMany(),
      prisma.product.findMany(),
      prisma.order.findMany({ include: { items: true } }),
      prisma.category.findMany(),
      prisma.brand.findMany(),
      prisma.coupon.findMany(),
    ]);
    fs.writeFileSync(path.join(BACKUP_DIR, name), JSON.stringify({ createdAt: new Date(), settings, pages, products, orders, categories, brands, coupons }, null, 2));
    await logActivity(req, "backup.create", "backup", name);
    return res.json({ success: true, data: { message: "Backup created", name } });
  }
);

// GET /api/admin/backups/:id/download
export const getBackupsIdDownload = defineRoute(
  adminRequired,
  ownerOnly,
  async (req, res) => {
    ensureBackupDir();
    const file = backupFile(req.params.id);
    if (!fs.existsSync(file)) throw NotFound("Backup not found");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename=${req.params.id}.json`);
    return res.send(fs.readFileSync(file));
  }
);

// POST /api/admin/backups/:id/restore - restores settings & pages
export const postBackupsIdRestore = defineRoute(
  adminRequired,
  async (req, res) => {
    const role = req.user!.role as string;
    if (role !== "super_admin") throw Forbidden("Only the super admin can restore backups");
    ensureBackupDir();
    const file = backupFile(req.params.id);
    if (!fs.existsSync(file)) throw NotFound("Backup not found");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const s of data.settings ?? []) {
      await prisma.systemSetting.upsert({ where: { key: s.key }, update: { value: s.value }, create: s });
    }
    for (const p of data.pages ?? []) {
      await prisma.page.upsert({ where: { slug: p.slug }, update: { title: p.title, content: p.content, status: p.status }, create: { slug: p.slug, title: p.title, content: p.content, status: p.status } });
    }
    await logActivity(req, "backup.restore", "backup", req.params.id);
    return res.json({ success: true, data: { message: "Settings and pages restored from backup" } });
  }
);
