import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncH } from "../../lib/async";
import { NotFound } from "../../lib/errors";
import { adminRequired, can } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { logActivity } from "../../lib/activity";

export const adminMarketingRouter = Router();

adminMarketingRouter.use(adminRequired);

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

const couponSchema = z.object({
  code: z.string().min(2).transform((s) => s.toUpperCase()),
  type: z.enum(["percentage", "fixed"]),
  value: z.number().positive(),
  minOrderAmount: z.number().min(0).default(0),
  maxDiscountAmount: z.number().min(0).optional(),
  usageLimit: z.number().int().positive().optional(),
  perUserLimit: z.number().int().positive().default(1),
  startDate: z.string(),
  endDate: z.string(),
  description: z.string().optional(),
  status: z.string().optional(),
  applicableCategoryIds: z.array(z.string().uuid()).optional(),
  applicableProductIds: z.array(z.string().uuid()).optional(),
});

adminMarketingRouter.get(
  "/coupons",
  asyncH(async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const [total, items] = await Promise.all([
      prisma.coupon.count(),
      prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, skip, take, include: { _count: { select: { usage: true } } } }),
    ]);
    res.json({
      success: true,
      data: {
        items: items.map((c) => ({ ...c, value: Number(c.value).toString(), minOrderAmount: Number(c.minOrderAmount).toString(), maxDiscountAmount: c.maxDiscountAmount ? Number(c.maxDiscountAmount).toString() : null, usedCount: c.usedCount, usageCount: c._count.usage })),
        total,
        page,
        pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  })
);

adminMarketingRouter.post(
  "/coupons",
  can("marketing.edit"),
  validate(couponSchema),
  asyncH(async (req, res) => {
    const d = req.body;
    const coupon = await prisma.coupon.create({
      data: {
        code: d.code,
        type: d.type,
        value: d.value,
        minOrderAmount: d.minOrderAmount,
        maxDiscountAmount: d.maxDiscountAmount ?? null,
        usageLimit: d.usageLimit ?? null,
        perUserLimit: d.perUserLimit,
        startDate: new Date(d.startDate),
        endDate: new Date(d.endDate),
        description: d.description ?? null,
        status: d.status ?? "active",
        applicableCategories: { connect: (d.applicableCategoryIds ?? []).map((id: string) => ({ id })) },
        applicableProducts: { connect: (d.applicableProductIds ?? []).map((id: string) => ({ id })) },
      },
      include: { applicableCategories: true, applicableProducts: true },
    });
    await logActivity(req, "coupon.create", "coupon", coupon.id);
    res.json({ success: true, data: coupon });
  })
);

adminMarketingRouter.put(
  "/coupons/:id",
  can("marketing.edit"),
  validate(couponSchema.partial()),
  asyncH(async (req, res) => {
    const existing = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!existing) throw NotFound("Coupon not found");
    const d = req.body;
    const data: any = {};
    const keys = ["code", "type", "value", "minOrderAmount", "maxDiscountAmount", "usageLimit", "perUserLimit", "description", "status"];
    for (const k of keys) if (d[k] !== undefined) data[k] = d[k];
    if (d.startDate) data.startDate = new Date(d.startDate);
    if (d.endDate) data.endDate = new Date(d.endDate);
    if (d.applicableCategoryIds !== undefined) {
      data.applicableCategories = { set: d.applicableCategoryIds.map((id: string) => ({ id })) };
    }
    if (d.applicableProductIds !== undefined) {
      data.applicableProducts = { set: d.applicableProductIds.map((id: string) => ({ id })) };
    }
    const coupon = await prisma.coupon.update({
      where: { id: existing.id },
      data,
      include: { applicableCategories: true, applicableProducts: true },
    });
    await logActivity(req, "coupon.update", "coupon", coupon.id);
    res.json({ success: true, data: coupon });
  })
);

adminMarketingRouter.delete(
  "/coupons/:id",
  can("marketing.edit"),
  asyncH(async (req, res) => {
    await prisma.coupon.delete({ where: { id: req.params.id } });
    await logActivity(req, "coupon.delete", "coupon", req.params.id);
    res.json({ success: true, data: { message: "Coupon deleted" } });
  })
);

// GET /api/admin/coupons/:id/usage
adminMarketingRouter.get(
  "/coupons/:id/usage",
  asyncH(async (req, res) => {
    const usage = await prisma.couponUsage.findMany({
      where: { couponId: req.params.id },
      include: { user: true, order: true },
      orderBy: { usedAt: "desc" },
      take: 100,
    });
    res.json({
      success: true,
      data: usage.map((u) => ({
        id: u.id,
        usedAt: u.usedAt,
        customer: [u.user.firstName, u.user.lastName].filter(Boolean).join(" ") || u.user.phone,
        orderNumber: u.order?.orderNumber ?? null,
      })),
    });
  })
);

// ---------------------------------------------------------------------------
// Offers (banners of type "offers")
// ---------------------------------------------------------------------------

const bannerSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  imageUrl: z.string().url(),
  linkUrl: z.string().optional(),
  displayOrder: z.number().int().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.string().optional(),
});

const offerRouter = Router({ mergeParams: true });
offerRouter.get(
  "/",
  asyncH(async (_req, res) => {
    const offers = await prisma.banner.findMany({ where: { type: "offers" }, orderBy: { displayOrder: "asc" } });
    res.json({ success: true, data: offers });
  })
);
offerRouter.post(
  "/",
  can("marketing.edit"),
  validate(bannerSchema),
  asyncH(async (req, res) => {
    const d = req.body;
    const offer = await prisma.banner.create({
      data: {
        type: "offers",
        title: d.title ?? null,
        subtitle: d.subtitle ?? null,
        imageUrl: d.imageUrl,
        linkUrl: d.linkUrl ?? null,
        displayOrder: d.displayOrder ?? 0,
        startDate: d.startDate ? new Date(d.startDate) : null,
        endDate: d.endDate ? new Date(d.endDate) : null,
        status: d.status ?? "active",
      },
    });
    await logActivity(req, "offer.create", "offer", offer.id);
    cacheBustAll();
    res.json({ success: true, data: offer });
  })
);
offerRouter.put(
  "/:id",
  can("marketing.edit"),
  validate(bannerSchema.partial()),
  asyncH(async (req, res) => {
    const existing = await prisma.banner.findUnique({ where: { id: req.params.id } });
    if (!existing) throw NotFound("Offer not found");
    const data: any = { ...req.body };
    if (data.startDate) data.startDate = new Date(data.startDate);
    if (data.endDate) data.endDate = new Date(data.endDate);
    const offer = await prisma.banner.update({ where: { id: existing.id }, data });
    await logActivity(req, "offer.update", "offer", offer.id);
    cacheBustAll();
    res.json({ success: true, data: offer });
  })
);
offerRouter.delete(
  "/:id",
  can("marketing.edit"),
  asyncH(async (req, res) => {
    await prisma.banner.delete({ where: { id: req.params.id } });
    await logActivity(req, "offer.delete", "offer", req.params.id);
    cacheBustAll();
    res.json({ success: true, data: { message: "Offer deleted" } });
  })
);
adminMarketingRouter.use("/offers", offerRouter);

// ---------------------------------------------------------------------------
// Banners (homepage / special)
// ---------------------------------------------------------------------------

const bannerTypeSchema = z.enum(["homepage", "special"]);

adminMarketingRouter.get(
  "/banners",
  asyncH(async (req, res) => {
    const type = req.query.type ? String(req.query.type) : undefined;
    const banners = await prisma.banner.findMany({
      where: type ? { type: type as any } : { type: { in: ["homepage", "special"] } },
      orderBy: { displayOrder: "asc" },
    });
    res.json({ success: true, data: banners });
  })
);

adminMarketingRouter.post(
  "/banners",
  can("marketing.edit"),
  validate(bannerSchema.extend({ type: bannerTypeSchema })),
  asyncH(async (req, res) => {
    const d = req.body;
    const banner = await prisma.banner.create({
      data: {
        type: d.type,
        title: d.title ?? null,
        subtitle: d.subtitle ?? null,
        imageUrl: d.imageUrl,
        linkUrl: d.linkUrl ?? null,
        displayOrder: d.displayOrder ?? 0,
        startDate: d.startDate ? new Date(d.startDate) : null,
        endDate: d.endDate ? new Date(d.endDate) : null,
        status: d.status ?? "active",
      },
    });
    await logActivity(req, "banner.create", "banner", banner.id);
    cacheBustAll();
    res.json({ success: true, data: banner });
  })
);

adminMarketingRouter.put(
  "/banners/:id",
  can("marketing.edit"),
  validate(bannerSchema.partial()),
  asyncH(async (req, res) => {
    const existing = await prisma.banner.findUnique({ where: { id: req.params.id } });
    if (!existing) throw NotFound("Banner not found");
    const data: any = { ...req.body };
    if (data.startDate) data.startDate = new Date(data.startDate);
    if (data.endDate) data.endDate = new Date(data.endDate);
    const banner = await prisma.banner.update({ where: { id: existing.id }, data });
    await logActivity(req, "banner.update", "banner", banner.id);
    cacheBustAll();
    res.json({ success: true, data: banner });
  })
);

adminMarketingRouter.delete(
  "/banners/:id",
  can("marketing.edit"),
  asyncH(async (req, res) => {
    await prisma.banner.delete({ where: { id: req.params.id } });
    await logActivity(req, "banner.delete", "banner", req.params.id);
    cacheBustAll();
    res.json({ success: true, data: { message: "Banner deleted" } });
  })
);

import { paginate } from "../../lib/helpers";
import { cacheBustAll } from "../../lib/cache";
