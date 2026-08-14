import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncH } from "../../lib/async";
import { adminRequired } from "../../middleware/auth";
import { round2 } from "../../lib/helpers";

export const adminDashboardRouter = Router();

adminDashboardRouter.use(adminRequired);

// GET /api/admin/dashboard
adminDashboardRouter.get(
  "/",
  asyncH(async (_req, res) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    const [
      ordersToday,
      revenueToday,
      revenueMonth,
      productsInStock,
      customers,
      pendingOrders,
      totalProducts,
      totalOrders,
      recentOrders,
      recentCustomers,
      orders30,
      orderItems30,
      statusCounts,
      lowStock,
    ] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.order.aggregate({
        where: { createdAt: { gte: startOfDay }, paymentStatus: "paid" },
        _sum: { totalAmount: true },
      }),
      prisma.order.aggregate({
        where: { createdAt: { gte: startOfMonth }, paymentStatus: "paid" },
        _sum: { totalAmount: true },
      }),
      prisma.product.count({ where: { stockQuantity: { gt: 0 } } }),
      prisma.user.count({ where: { role: "customer" } }),
      prisma.order.count({ where: { status: "pending" } }),
      prisma.product.count(),
      prisma.order.count(),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { user: true, _count: { select: { items: true } } },
      }),
      prisma.user.findMany({ take: 5, where: { role: "customer" }, orderBy: { createdAt: "desc" } }),
      prisma.order.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true, totalAmount: true },
      }),
      prisma.orderItem.findMany({
        where: { order: { createdAt: { gte: thirtyDaysAgo } } },
        select: { quantity: true, productName: true, price: true },
      }),
      prisma.order.groupBy({ by: ["status"], _count: true }),
      prisma.product.count({ where: { stockQuantity: { lte: 10 } } }),
    ]);

    // Sales trend: last 30 days
    const byDay = new Map<string, { revenue: number; orders: number }>();
    for (const o of orders30) {
      const key = o.createdAt.toISOString().slice(0, 10);
      const e = byDay.get(key) ?? { revenue: 0, orders: 0 };
      e.revenue += Number(o.totalAmount);
      e.orders += 1;
      byDay.set(key, e);
    }
    const salesTrend = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(thirtyDaysAgo.getTime() + i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      salesTrend.push({ date: d, revenue: round2(byDay.get(d)?.revenue ?? 0), orders: byDay.get(d)?.orders ?? 0 });
    }

    // Top selling products
    const topMap = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const it of orderItems30) {
      const e = topMap.get(it.productName) ?? { name: it.productName, qty: 0, revenue: 0 };
      e.qty += it.quantity;
      e.revenue += Number(it.price) * it.quantity;
      topMap.set(it.productName, e);
    }
    const topProducts = [...topMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);

    res.json({
      success: true,
      data: {
        metrics: {
          ordersToday,
          revenueToday: Number(revenueToday._sum.totalAmount ?? 0).toString(),
          revenueMonth: Number(revenueMonth._sum.totalAmount ?? 0).toString(),
          productsInStock,
          lowStock,
          customers,
          pendingOrders,
          totalProducts,
          totalOrders,
        },
        salesTrend,
        topProducts,
        statusDistribution: statusCounts.map((s) => ({ status: s.status, count: s._count })),
        recentOrders: recentOrders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          total: o.totalAmount.toString(),
          customer: o.user ? [o.user.firstName, o.user.lastName].filter(Boolean).join(" ") || o.user.phone : "Guest",
          createdAt: o.createdAt,
          items: o._count.items,
        })),
        recentCustomers: recentCustomers.map((u) => ({
          id: u.id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.phone,
          phone: u.phone,
          shopName: u.shopName,
          createdAt: u.createdAt,
        })),
      },
    });
  })
);
