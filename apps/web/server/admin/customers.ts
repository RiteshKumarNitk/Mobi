import { defineRoute } from "@/lib/route";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { Conflict, NotFound } from "../../lib/errors";
import { paginate, publicUser } from "../../lib/helpers";
import { adminRequired, OWNER_ROLES, requireRole } from "../../lib/auth";
import { revokeUserTokens } from "../../lib/tokens";
import { hashPassword, passwordPolicyError } from "../../lib/passwords";
import { BadRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { logActivity } from "../../lib/activity";

// Writes are owner-only: staff/managers can view customers but not create, edit or
// deactivate accounts. Targets are restricted to role "customer" so this API can
// never be used to modify or lock out an admin account.
const ownerOnly = requireRole(...OWNER_ROLES);

async function customerOr404(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== "customer") throw NotFound("Customer not found");
  return user;
}

// GET /api/admin/customers
export const getAdminCustomers = defineRoute(
  adminRequired,
  async (req, res) => {
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
    return res.json({
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
  }
);

// GET /api/admin/customers/:id
export const getId = defineRoute(
  adminRequired,
  async (req, res) => {
    const customer = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { addresses: true, settings: true },
    });
    if (!customer || customer.role !== "customer") throw NotFound("Customer not found");
    return res.json({ success: true, data: publicUser(customer) });
  }
);

// GET /api/admin/customers/:id/orders
export const getIdOrders = defineRoute(
  adminRequired,
  async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { userId: req.params.id },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
    });
    return res.json({
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
  }
);

// POST /api/admin/customers
export const postAdminCustomers = defineRoute(
  adminRequired,
  ownerOnly,
  validate(
    z.object({
      name: z.string().min(2),
      phone: z.string().regex(/^[0-9]{10,15}$/),
      password: z.string().max(128),
      email: z.string().email().optional().or(z.literal("")),
      shopName: z.string().optional(),
      gstNumber: z.string().optional(),
    })
  ),
  async (req, res) => {
    const { name, phone, password, email, shopName, gstNumber } = req.body;
    const policy = passwordPolicyError(password);
    if (policy) throw BadRequest(policy, "VALIDATION");
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) throw Conflict("A user with this phone number already exists");
    const [first, ...rest] = name.trim().split(/\s+/);
    const user = await prisma.user.create({
      data: {
        phone,
        passwordHash: await hashPassword(password),
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
    return res.json({ success: true, data: publicUser(user) });
  }
);

// PUT /api/admin/customers/:id
export const putId = defineRoute(
  adminRequired,
  ownerOnly,
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
  async (req, res) => {
    const target = await customerOr404(req.params.id);
    const data: any = { ...req.body };
    if (data.email === "") data.email = null;
    const user = await prisma.user.update({ where: { id: target.id }, data });
    if (data.status && data.status !== "active") await revokeUserTokens(user.id);
    await logActivity(req, "customer.update", "customer", user.id);
    return res.json({ success: true, data: publicUser(user) });
  }
);

// DELETE /api/admin/customers/:id - soft deactivate
export const deleteId = defineRoute(
  adminRequired,
  ownerOnly,
  async (req, res) => {
    const target = await customerOr404(req.params.id);
    await prisma.user.update({ where: { id: target.id }, data: { status: "inactive" } });
    await revokeUserTokens(target.id);
    await logActivity(req, "customer.delete", "customer", req.params.id);
    return res.json({ success: true, data: { message: "Customer deactivated" } });
  }
);
