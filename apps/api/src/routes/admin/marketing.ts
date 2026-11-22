import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncH } from "../../lib/async";
import { BadRequest, NotFound } from "../../lib/errors";
import { adminRequired, can } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { logActivity } from "../../lib/activity";

export const adminMarketingRouter = Router();

adminMarketingRouter.use(adminRequired);

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

const dateString = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

const couponBase = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "Coupon code may contain letters, digits, _ and - only")
    .transform((s) => s.toUpperCase()),
  type: z.enum(["percentage", "fixed"]),
  value: z.number().positive().max(10_000_000),
  minOrderAmount: z.number().min(0).default(0),
  maxDiscountAmount: z.number().min(0).nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  perUserLimit: z.number().int().positive().default(1),
  startDate: dateString,
  endDate: dateString,
  description: z.string().max(500).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  applicableCategoryIds: z.array(z.string().uuid()).max(200).optional(),
  applicableProductIds: z.array(z.string().uuid()).max(500).optional(),
});

function couponIssue(d: { type?: string; value?: number; startDate?: string; endDate?: string }): string | null {
  if (d.type === "percentage" && d.value != null && d.value > 100) return "A percentage coupon cannot exceed 100%";
  if (d.startDate && d.endDate && Date.parse(d.endDate) <= Date.parse(d.startDate)) return "endDate must be after startDate";
  return null;
}

const couponSchema = couponBase.superRefine((d, ctx) => {
  const issue = couponIssue(d);
  if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue });
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
  validate(couponBase.partial()),
  asyncH(async (req, res) => {
    const existing = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!existing) throw NotFound("Coupon not found");
    const d = req.body;
    const issue = couponIssue({
      type: d.type ?? existing.type,
      value: d.value ?? Number(existing.value),
      startDate: d.startDate ?? existing.startDate.toISOString(),
      endDate: d.endDate ?? existing.endDate.toISOString(),
    });
    if (issue) throw BadRequest(issue, "VALIDATION");
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

/** Only http(s) URLs or site-relative paths — never javascript:/data: (stored XSS on the storefront). */
const safeHref = z
  .string()
  .trim()
  .max(1000)
  .refine((s) => s === "" || /^\/(?!\/)/.test(s) || /^https?:\/\//i.test(s), "Link must be a site path (/products) or an http(s) URL");
const httpUrl = z.string().trim().url().max(1000).refine((s) => /^https?:\/\//i.test(s), "Must be an http(s) URL");

const bannerSchema = z.object({
  title: z.string().max(200).optional(),
  subtitle: z.string().max(500).optional(),
  imageUrl: httpUrl,
  linkUrl: safeHref.optional(),
  displayOrder: z.number().int().optional(),
  startDate: dateString.optional(),
  endDate: dateString.optional(),
  status: z.enum(["active", "inactive"]).optional(),
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
