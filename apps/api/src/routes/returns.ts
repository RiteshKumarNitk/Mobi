import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncH } from "../lib/async";
import { BadRequest, Conflict, Forbidden, NotFound } from "../lib/errors";
import { genReturnNumber } from "../lib/helpers";
import { authRequired, isAdminRole } from "../middleware/auth";
import { validate } from "../middleware/validate";

export const returnsRouter = Router();

returnsRouter.use(authRequired);

// POST /api/returns/create
returnsRouter.post(
  "/create",
  validate(
    z.object({
      orderId: z.string().uuid(),
      reason: z.string().min(3, "Please select a reason"),
      description: z.string().optional(),
      items: z.array(z.object({ orderItemId: z.string().uuid(), quantity: z.number().int().min(1) })).min(1),
    })
  ),
  asyncH(async (req, res) => {
    const userId = (req as any).user.id;
    const order = await prisma.order.findUnique({
      where: { id: req.body.orderId },
      include: { items: true },
    });
    if (!order || order.userId !== userId) throw NotFound("Order not found");
    if (order.status !== "delivered") {
      throw BadRequest("Returns are allowed only for delivered orders");
    }
    const existing = await prisma.returnRequest.findFirst({
      where: { orderId: order.id, status: { in: ["pending", "approved", "processed"] } },
    });
    if (existing) throw Conflict("A return request already exists for this order");

    const returnNumber = genReturnNumber();
    const returnReq = await prisma.returnRequest.create({
      data: {
        orderId: order.id,
        userId,
        returnNumber,
        reason: req.body.reason,
        description: req.body.description ?? null,
        items: { create: req.body.items.map((i: any) => ({ orderItemId: i.orderItemId, quantity: i.quantity })) },
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
    res.json({ success: true, data: { message: "Return request submitted", returnId: returnReq.id, returnNumber } });
  })
);

// GET /api/returns
returnsRouter.get(
  "/",
  asyncH(async (req, res) => {
    const returns = await prisma.returnRequest.findMany({
      where: { userId: (req as any).user.id },
      include: { order: { select: { orderNumber: true } }, items: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: returns });
  })
);

// GET /api/returns/:id
returnsRouter.get(
  "/:id",
  asyncH(async (req, res) => {
    const returnReq = await prisma.returnRequest.findUnique({
      where: { id: req.params.id },
      include: { order: { include: { items: true } }, items: true },
    });
    if (!returnReq) throw NotFound("Return request not found");
    const user = (req as any).user;
    if (returnReq.userId !== user.id && !isAdminRole(user.role)) throw Forbidden();
    res.json({ success: true, data: returnReq });
  })
);
