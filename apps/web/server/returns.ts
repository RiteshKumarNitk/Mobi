import { defineRoute } from "@/lib/route";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { BadRequest, Conflict, Forbidden, NotFound } from "../lib/errors";
import { genReturnNumber } from "../lib/helpers";
import { authRequired, isAdminRole } from "../lib/auth";
import { validate } from "../lib/validate";

// POST /api/returns/create
export const postCreate = defineRoute(
  authRequired,
  validate(
    z.object({
      orderId: z.string().uuid(),
      reason: z.string().trim().min(3, "Please select a reason").max(200),
      description: z.string().max(2000).optional(),
      items: z.array(z.object({ orderItemId: z.string().uuid(), quantity: z.number().int().min(1).max(10000) })).min(1).max(200),
    })
  ),
  async (req, res) => {
    const userId = req.user!.id;
    const order = await prisma.order.findUnique({
      where: { id: req.body.orderId },
      include: { items: true },
    });
    if (!order || order.userId !== userId) throw NotFound("Order not found");
    if (order.status !== "delivered") {
      throw BadRequest("Returns are allowed only for delivered orders");
    }
    const existing = await prisma.returnRequest.findFirst({
      where: { orderId: order.id, status: { in: ["pending", "approved"] } },
    });
    if (existing) throw Conflict("A return request is already open for this order");

    // Every returned line must be an item of THIS order, and the quantity may not
    // exceed what was bought minus what earlier (non-rejected) returns already cover.
    const itemsById = new Map(order.items.map((i) => [i.id, i]));
    const previously = await prisma.returnItem.groupBy({
      by: ["orderItemId"],
      where: { returnRequest: { orderId: order.id, status: { not: "rejected" } } },
      _sum: { quantity: true },
    });
    const alreadyReturned = new Map(previously.map((p) => [p.orderItemId, p._sum.quantity ?? 0]));
    const requested = new Map<string, number>();
    for (const i of req.body.items as { orderItemId: string; quantity: number }[]) {
      requested.set(i.orderItemId, (requested.get(i.orderItemId) ?? 0) + i.quantity);
    }
    for (const [orderItemId, qty] of requested) {
      const item = itemsById.get(orderItemId);
      if (!item) throw BadRequest("Return items must belong to this order", "RETURN_ITEM_INVALID");
      const left = item.quantity - (alreadyReturned.get(orderItemId) ?? 0);
      if (qty > left) throw BadRequest(`You can return at most ${Math.max(0, left)} of "${item.productName}"`, "RETURN_QTY_EXCEEDED");
    }

    const returnNumber = genReturnNumber();
    const returnReq = await prisma.returnRequest.create({
      data: {
        orderId: order.id,
        userId,
        returnNumber,
        reason: req.body.reason,
        description: req.body.description ?? null,
        items: { create: [...requested.entries()].map(([orderItemId, quantity]) => ({ orderItemId, quantity })) },
      },
    });
    await prisma.notification.create({
      data: {
        userId,
        type: "return",
        title: "Return requested",
        message: `Return request ${returnNumber} submitted for order ${order.orderNumber}.`,
      },
    });
    return res.json({ success: true, data: { message: "Return request submitted", returnId: returnReq.id, returnNumber } });
  }
);

// GET /api/returns
export const getReturns = defineRoute(
  authRequired,
  async (req, res) => {
    const returns = await prisma.returnRequest.findMany({
      where: { userId: req.user!.id },
      include: { order: { select: { orderNumber: true } }, items: true },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, data: returns });
  }
);

// GET /api/returns/:id
export const getId = defineRoute(
  authRequired,
  async (req, res) => {
    const returnReq = await prisma.returnRequest.findUnique({
      where: { id: req.params.id },
      include: { order: { include: { items: true } }, items: true },
    });
    if (!returnReq) throw NotFound("Return request not found");
    const user = req.user!;
    if (returnReq.userId !== user.id && !isAdminRole(user.role)) throw Forbidden();
    return res.json({ success: true, data: returnReq });
  }
);
