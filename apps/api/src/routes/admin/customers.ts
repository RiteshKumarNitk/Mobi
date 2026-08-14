import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncH } from "../../lib/async";
import { Conflict, NotFound } from "../../lib/errors";
import { paginate, publicUser } from "../../lib/helpers";
import { adminRequired } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { logActivity } from "../../lib/activity";

export const adminCustomersRouter = Router();

adminCustomersRouter.use(adminRequired);

// GET /api/admin/customers
adminCustomersRouter.get(
  "/",
  asyncH(async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const { q, status } = req.query;
    const where: any = { role: "customer" };
    if (status) where.status = String(status);
    if (q) {
      where.OR = [
        { phone: { contains: String(q), mode: "insensitive" } },
        { firstName: { contains: String(q), mode: "insensitive" } },
        { shopName: { contains: String(q), mode: "insensitive" } },
        { email: { contains: String(q), mode: "insensitive" } },
      ];
    }
    const [total, customers] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    ]);
    const ids = customers.map((c) => c.id);
    const orders = await prisma.order.groupBy({
      by: ["userId"],
      where: { userId: { in: ids } },
      _count: true,
      _sum: { totalAmount: true },
    });
    const orderMap = new Map(orders.map((o) => [o.userId, o]));
    res.json({
      success: true,
      data: {
        items: customers.map((c) => {
          const stats = orderMap.get(c.id);
          return {
            ...publicUser(c),
            orderCount: stats?._count ?? 0,
            totalSpent: Number(stats?._sum.totalAmount ?? 0).toString(),
          };
        }),
        total,
        page,
        pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  })
);

// GET /api/admin/customers/:id
adminCustomersRouter.get(
  "/:id",
  asyncH(async (req, res) => {
    const customer = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { addresses: true, settings: true },
    });
    if (!customer) throw NotFound("Customer not found");
    res.json({ success: true, data: publicUser(customer) });
  })
);

// GET /api/admin/customers/:id/orders
adminCustomersRouter.get(
  "/:id/orders",
  asyncH(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { userId: req.params.id },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      success: true,
      data: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        totalAmount: o.totalAmount.toString(),
        createdAt: o.createdAt,
        itemsCount: o._count.items,
      })),
    });
  })
);

// POST /api/admin/customers
adminCustomersRouter.post(
  "/",
  validate(
    z.object({
      name: z.string().min(2),
      phone: z.string().regex(/^[0-9]{10,15}$/),
      password: z.string().min(6),
      email: z.string().email().optional().or(z.literal("")),
      shopName: z.string().optional(),
      gstNumber: z.string().optional(),
    })
  ),
  asyncH(async (req, res) => {
    const { name, phone, password, email, shopName, gstNumber } = req.body;
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) throw Conflict("A user with this phone number already exists");
    const [first, ...rest] = name.trim().split(/\s+/);
    const user = await prisma.user.create({
      data: {
        phone,
        passwordHash: await bcrypt.hash(password, 10),
        firstName: first,
        lastName: rest.join(" ") || null,
        email: email || null,
        shopName: shopName || null,
        gstNumber: gstNumber || null,
        phoneVerified: true,
        settings: { create: {} },
      },
    });
    await logActivity(req, "customer.create", "customer", user.id);
    res.json({ success: true, data: publicUser(user) });
  })
);

// PUT /api/admin/customers/:id
adminCustomersRouter.put(
  "/:id",
  validate(
    z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      shopName: z.string().optional(),
      gstNumber: z.string().optional(),
      status: z.enum(["active", "inactive", "pending"]).optional(),
      adminNotes: z.string().optional(),
    })
  ),
  asyncH(async (req, res) => {
    const data: any = { ...req.body };
    if (data.email === "") data.email = null;
    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    await logActivity(req, "customer.update", "customer", user.id);
    res.json({ success: true, data: publicUser(user) });
  })
);

// DELETE /api/admin/customers/:id - soft deactivate
adminCustomersRouter.delete(
  "/:id",
  asyncH(async (req, res) => {
    await prisma.user.update({ where: { id: req.params.id }, data: { status: "inactive" } });
    await logActivity(req, "customer.delete", "customer", req.params.id);
    res.json({ success: true, data: { message: "Customer deactivated" } });
  })
);
