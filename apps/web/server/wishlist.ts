import { defineRoute } from "@/lib/route";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { NotFound } from "../lib/errors";
import { productCard } from "../lib/helpers";
import { authRequired } from "../lib/auth";
import { validate } from "../lib/validate";

// GET /api/wishlist
export const getWishlist = defineRoute(
  authRequired,
  async (req, res) => {
    const items = await prisma.wishlistItem.findMany({
      where: { userId: req.user!.id },
      include: { product: { include: { images: true, brand: true } } },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, data: items.map((i) => ({ id: i.id, createdAt: i.createdAt, product: productCard(i.product) })) });
  }
);

// POST /api/wishlist/add
export const postAdd = defineRoute(
  authRequired,
  validate(z.object({ productId: z.string().uuid() })),
  async (req, res) => {
    const { productId } = req.body;
    const userId = req.user!.id;
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw NotFound("Product not found");
    const existing = await prisma.wishlistItem.findUnique({ where: { userId_productId: { userId, productId } } });
    if (!existing) {
      await prisma.wishlistItem.create({ data: { userId, productId } });
    }
    return res.json({ success: true, data: { message: "Added to wishlist" } });
  }
);

// DELETE /api/wishlist/remove?productId=
export const deleteRemove = defineRoute(
  authRequired,
  validate(z.object({ productId: z.string().uuid() }), "query"),
  async (req, res) => {
    const { productId } = (req as any).validatedQuery;
    await prisma.wishlistItem.deleteMany({ where: { userId: req.user!.id, productId } });
    return res.json({ success: true, data: { message: "Removed from wishlist" } });
  }
);

// POST /api/wishlist/move-to-cart
export const postMoveToCart = defineRoute(
  authRequired,
  validate(z.object({ productId: z.string().uuid() })),
  async (req, res) => {
    const { productId } = req.body;
    const userId = req.user!.id;
    await prisma.wishlistItem.deleteMany({ where: { userId, productId } });
    const existing = await prisma.cartItem.findFirst({ where: { userId, productId } });
    if (existing) await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + 1, isSavedForLater: false } });
    else await prisma.cartItem.create({ data: { userId, productId, quantity: 1 } });
    return res.json({ success: true, data: { message: "Moved to cart" } });
  }
);
