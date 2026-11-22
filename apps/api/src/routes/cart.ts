import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncH } from "../lib/async";
import { BadRequest, NotFound, Unauthorized } from "../lib/errors";
import { effectiveUnitPrice, round2 } from "../lib/helpers";
import { validate } from "../middleware/validate";
import { validateCoupon } from "../lib/coupons";
import { shippingChargeFor } from "../lib/settings";
import { optionalAuth } from "../middleware/auth";

export const cartRouter = Router();

const MAX_LINE_QTY = 9999;

function deviceIdOf(req: any): string | null {
  const raw = req.headers["x-device-id"];
  // Device ids are client-generated UUIDs; reject anything else (keys a DB lookup).
  return typeof raw === "string" && /^[A-Za-z0-9-]{8,64}$/.test(raw) ? raw : null;
}

function ownerOf(req: any): { userId: string } | { deviceId: string } | null {
  const userId = req.user?.id;
  if (userId) return { userId };
  const deviceId = deviceIdOf(req);
  if (deviceId) return { deviceId };
  return null;
}

/**
 * When a signed-in request still carries the guest device id, move the guest
 * cart into the account cart (quantities are added) so items picked before
 * login are not lost — and so checkout, which reads the account cart, sees them.
 */
async function mergeGuestCart(req: any) {
  const userId = req.user?.id;
  const deviceId = deviceIdOf(req);
  if (!userId || !deviceId) return;
  // Cheap pre-check outside the transaction: nothing to merge on most requests.
  const pending = await prisma.cartItem.count({ where: { deviceId } });
  const guestSession0 = await prisma.cartSession.findUnique({ where: { deviceId }, select: { id: true } });
  if (!pending && !guestSession0) return;
  await prisma.$transaction(async (tx) => {
    // Serialize merges per user: the storefront fires several cart requests at
    // login, and two concurrent merges of the same rows would double-count or
    // delete items. Rows are re-read after taking the lock.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"cart:" + userId}))`;
    const guestItems = await tx.cartItem.findMany({ where: { deviceId } });
    for (const g of guestItems) {
      const existing = await tx.cartItem.findFirst({ where: { userId, productId: g.productId, id: { not: g.id } } });
      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: Math.min(MAX_LINE_QTY, existing.quantity + g.quantity), isSavedForLater: existing.isSavedForLater && g.isSavedForLater },
        });
        await tx.cartItem.deleteMany({ where: { id: g.id, deviceId } });
      } else {
        await tx.cartItem.updateMany({ where: { id: g.id, deviceId }, data: { userId, deviceId: null } });
      }
    }
    const guestSession = await tx.cartSession.findUnique({ where: { deviceId } });
    if (guestSession) {
      if (guestSession.couponId) {
        await tx.cartSession.upsert({ where: { userId }, update: { couponId: guestSession.couponId }, create: { userId, couponId: guestSession.couponId } });
      }
      await tx.cartSession.deleteMany({ where: { id: guestSession.id } });
    }
  });
}

async function getSession(req: any) {
  const owner = ownerOf(req);
  if (!owner) return null;
  try {
    return await prisma.cartSession.upsert({ where: owner, update: {}, create: owner, include: { coupon: true } });
  } catch (e: any) {
    // Two concurrent first requests can race on the unique owner key; the row exists now.
    if (e?.code === "P2002") return prisma.cartSession.findUnique({ where: owner, include: { coupon: true } });
    throw e;
  }
}

cartRouter.use(optionalAuth, (req, _res, next) => {
  mergeGuestCart(req).then(() => next(), next);
});

async function cartSubtotal(req: any): Promise<number> {
  const owner = ownerOf(req);
  if (!owner) return 0;
  const items = await prisma.cartItem.findMany({
    where: { ...owner, isSavedForLater: false },
    include: { product: true },
  });
  return items.reduce((s, i) => s + effectiveUnitPrice(i.product, i.quantity) * i.quantity, 0);
}

function cartItemOut(item: any) {
  const p = item.product;
  const image = p.images?.length ? [...p.images].sort((a: any, b: any) => Number(b.isPrimary) - Number(a.isPrimary))[0] : null;
  const unitPrice = effectiveUnitPrice(p, item.quantity);
  const boxPrice = p.boxPrice != null ? Number(p.boxPrice) : null;
  const boxQuantity = p.boxQuantity ?? null;
  const bulkApplied = boxPrice != null && boxQuantity != null && item.quantity >= boxQuantity;
  return {
    id: item.id,
    quantity: item.quantity,
    isSavedForLater: item.isSavedForLater,
    unitPrice: unitPrice.toString(),
    lineTotal: round2(unitPrice * item.quantity).toString(),
    bulkApplied,
    product: {
      id: p.id,
      name: p.name,
      sku: p.sku,
      slug: p.slug,
      price: Number(p.price).toString(),
      mrp: p.mrp != null ? Number(p.mrp).toString() : null,
      boxPrice: boxPrice?.toString() ?? null,
      boxQuantity,
      stockQuantity: p.stockQuantity,
      stockStatus: p.stockStatus,
      image: image?.url ?? null,
      brand: p.brand ? { name: p.brand.name } : null,
    },
  };
}

// GET /api/cart
cartRouter.get(
  "/",
  asyncH(async (req, res) => {
    const session = await getSession(req);
    const owner = ownerOf(req);
    if (!session || !owner) {
      return res.json({
        success: true,
        data: { items: [], savedForLater: [], coupon: null, summary: { subtotal: "0", discount: "0", shipping: "0", total: "0" } },
      });
    }
    const items = await prisma.cartItem.findMany({
      where: owner,
      include: { product: { include: { images: true, brand: true } } },
      orderBy: { createdAt: "asc" },
    });

    const active = items.filter((i) => !i.isSavedForLater);
    const saved = items.filter((i) => i.isSavedForLater);
    const subtotal = active.reduce((s, i) => s + effectiveUnitPrice(i.product, i.quantity) * i.quantity, 0);

    const coupon = session.coupon;
    let discount = 0;
    let couponInfo: any = null;
    if (coupon) {
      const check = await validateCoupon(coupon, (req as any).user?.id, subtotal);
      if (check.valid) {
        discount = check.discount;
        couponInfo = { code: coupon.code, discountAmount: discount.toString(), description: coupon.description };
      } else {
        // expired/invalid coupon stays attached but yields no discount
        couponInfo = { code: coupon.code, discountAmount: "0", message: check.message };
      }
    }

    const shipping = subtotal - discount > 0 ? await shippingChargeFor(subtotal - discount) : 0;
    const total = round2(subtotal - discount + shipping);

    res.json({
      success: true,
      data: {
        items: active.map(cartItemOut),
        savedForLater: saved.map(cartItemOut),
        coupon: couponInfo,
        summary: {
          subtotal: round2(subtotal).toString(),
          discount: round2(discount).toString(),
          shipping: round2(shipping).toString(),
          total: total.toString(),
        },
      },
    });
  })
);

// POST /api/cart/add
cartRouter.post(
  "/add",
  validate(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(MAX_LINE_QTY).default(1) })),
  asyncH(async (req, res) => {
    const { productId, quantity } = req.body;
    const owner = ownerOf(req);
    if (!owner) throw Unauthorized("Login or provide an x-device-id header to use the cart");
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.status !== "active") throw NotFound("Product not found");

    const existing = await prisma.cartItem.findFirst({ where: { ...owner, productId } });
    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: Math.min(MAX_LINE_QTY, existing.quantity + quantity), isSavedForLater: false },
      });
    } else {
      await prisma.cartItem.create({ data: { ...owner, productId, quantity } });
    }
    await getSession(req); // ensure session exists for guest carts
    res.json({ success: true, data: { message: "Added to cart" } });
  })
);

// PUT /api/cart/update
cartRouter.put(
  "/update",
  validate(z.object({ itemId: z.string().uuid(), quantity: z.number().int().min(0).max(MAX_LINE_QTY) })),
  asyncH(async (req, res) => {
    const { itemId, quantity } = req.body;
    const owner = ownerOf(req);
    const item = await prisma.cartItem.findUnique({ where: { id: itemId } });
    if (!item || !owner || (item.userId ? item.userId !== (owner as any).userId : item.deviceId !== (owner as any).deviceId)) {
      throw NotFound("Cart item not found");
    }
    if (quantity === 0) await prisma.cartItem.delete({ where: { id: itemId } });
    else await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
    res.json({ success: true, data: { message: "Cart updated" } });
  })
);

// DELETE /api/cart/remove?itemId=
cartRouter.delete(
  "/remove",
  validate(z.object({ itemId: z.string().uuid() }), "query"),
  asyncH(async (req, res) => {
    const { itemId } = (req as any).validatedQuery;
    const owner = ownerOf(req);
    const item = await prisma.cartItem.findUnique({ where: { id: itemId } });
    if (!item || !owner || (item.userId ? item.userId !== (owner as any).userId : item.deviceId !== (owner as any).deviceId)) {
      throw NotFound("Cart item not found");
    }
    await prisma.cartItem.delete({ where: { id: itemId } });
    res.json({ success: true, data: { message: "Removed from cart" } });
  })
);

// POST /api/cart/save-for-later
cartRouter.post(
  "/save-for-later",
  validate(z.object({ itemId: z.string().uuid(), saved: z.boolean() })),
  asyncH(async (req, res) => {
    const { itemId, saved } = req.body;
    const owner = ownerOf(req);
    const item = await prisma.cartItem.findUnique({ where: { id: itemId } });
    if (!item || !owner || (item.userId ? item.userId !== (owner as any).userId : item.deviceId !== (owner as any).deviceId)) {
      throw NotFound("Cart item not found");
    }
    await prisma.cartItem.update({ where: { id: itemId }, data: { isSavedForLater: saved } });
    res.json({ success: true, data: { message: saved ? "Saved for later" : "Moved to cart" } });
  })
);

// POST /api/cart/apply-coupon
cartRouter.post(
  "/apply-coupon",
  validate(z.object({ code: z.string().trim().min(1).max(50) })),
  asyncH(async (req, res) => {
    const session = await getSession(req);
    if (!session) throw Unauthorized("Login or provide an x-device-id header");
    const code = String(req.body.code).trim().toUpperCase();
    const coupon = await prisma.coupon.findUnique({ where: { code } });
    const subtotal = await cartSubtotal(req);
    const check = await validateCoupon(coupon, (req as any).user?.id, subtotal);
    if (!check.valid) throw BadRequest(check.message, "COUPON_INVALID");
    await prisma.cartSession.update({ where: { id: session.id }, data: { couponId: coupon!.id } });
    res.json({ success: true, data: { message: "Coupon applied", coupon: { code, discountAmount: check.discount.toString() } } });
  })
);

// DELETE /api/cart/remove-coupon
cartRouter.delete(
  "/remove-coupon",
  asyncH(async (req, res) => {
    const session = await getSession(req);
    if (session) await prisma.cartSession.update({ where: { id: session.id }, data: { couponId: null } });
    res.json({ success: true, data: { message: "Coupon removed" } });
  })
);

// POST /api/cart/quick-add - bulk add by SKU (one per line, optional "SKU xQty" or "SKU Qty")
cartRouter.post(
  "/quick-add",
  validate(z.object({ lines: z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().min(1).max(MAX_LINE_QTY).default(1) })).min(1).max(100) })),
  asyncH(async (req, res) => {
    const owner = ownerOf(req);
    if (!owner) throw Unauthorized("Login or provide an x-device-id header to use the cart");
    const { lines } = req.body as { lines: { sku: string; quantity: number }[] };

    const skus = lines.map((l) => l.sku.trim().toUpperCase());
    const products = await prisma.product.findMany({
      where: { sku: { in: skus }, status: "active" },
      include: { images: true, brand: true },
    });
    const bySku = new Map(products.map((p) => [p.sku.toUpperCase(), p]));

    const results: any[] = [];
    let added = 0;
    await getSession(req);
    for (const line of lines) {
      const sku = line.sku.trim().toUpperCase();
      const p = bySku.get(sku);
      if (!p) {
        results.push({ sku, found: false, error: "SKU not found" });
        continue;
      }
      if (p.stockQuantity < line.quantity) {
        results.push({ sku, found: true, name: p.name, error: `Only ${p.stockQuantity} in stock` });
        continue;
      }
      const existing = await prisma.cartItem.findFirst({ where: { ...owner, productId: p.id } });
      if (existing) {
        await prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: Math.min(MAX_LINE_QTY, existing.quantity + line.quantity), isSavedForLater: false },
        });
      } else {
        await prisma.cartItem.create({ data: { ...owner, productId: p.id, quantity: line.quantity } });
      }
      added += line.quantity;
      results.push({ sku, found: true, name: p.name, quantity: line.quantity, price: Number(p.price).toString(), added: true });
    }

    res.json({ success: true, data: { message: `${added} item(s) added to cart`, added, results } });
  })
);
