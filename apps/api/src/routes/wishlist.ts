import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncH } from "../lib/async";
import { NotFound } from "../lib/errors";
import { productCard } from "../lib/helpers";
import { authRequired } from "../middleware/auth";
import { validate } from "../middleware/validate";

export const wishlistRouter = Router();

wishlistRouter.use(authRequired);

// GET /api/wishlist
wishlistRouter.get(
  "/",
  asyncH(async (req, res) => {
    const items = await prisma.wishlistItem.findMany({
      where: { userId: (req as any).user.id },
      include: { product: { include: { images: true, brand: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: items.map((i) => ({ id: i.id, createdAt: i.createdAt, product: productCard(i.product) })) });
  })
);

// POST /api/wishlist/add
wishlistRouter.post(
  "/add",
  validate(z.object({ productId: z.string().uuid() })),
  asyncH(async (req, res) => {
    const { productId } = req.body;
    const userId = (req as any).user.id;
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw NotFound("Product not found");
    const existing = await prisma.wishlistItem.findUnique({ where: { userId_productId: { userId, productId } } });
    if (!existing) {
      await prisma.wishlistItem.create({ data: { userId, productId } });
    }
    res.json({ success: true, data: { message: "Added to wishlist" } });
  })
);

// DELETE /api/wishlist/remove?productId=
wishlistRouter.delete(
  "/remove",
  validate(z.object({ productId: z.string().uuid() }), "query"),
  asyncH(async (req, res) => {
    const { productId } = (req as any).validatedQuery;
    await prisma.wishlistItem.deleteMany({ where: { userId: (req as any).user.id, productId } });
    res.json({ success: true, data: { message: "Removed from wishlist" } });
  })
);

// POST /api/wishlist/move-to-cart
wishlistRouter.post(
  "/move-to-cart",
  validate(z.object({ productId: z.string().uuid() })),
  asyncH(async (req, res) => {
    const { productId } = req.body;
    const userId = (req as any).user.id;
    await prisma.wishlistItem.deleteMany({ where: { userId, productId } });
    const existing = await prisma.cartItem.findFirst({ where: { userId, productId } });
    if (existing) await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + 1, isSavedForLater: false } });
    else await prisma.cartItem.create({ data: { userId, productId, quantity: 1 } });
    res.json({ success: true, data: { message: "Moved to cart" } });
  })
);
