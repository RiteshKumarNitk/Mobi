import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncH } from "../lib/async";
import { NotFound } from "../lib/errors";

export const offersRouter = Router();

// GET /api/offers - active offer banners + active coupons
offersRouter.get(
  "/",
  asyncH(async (_req, res) => {
    const now = new Date();
    const [banners, coupons] = await Promise.all([
      prisma.banner.findMany({
        where: {
          type: "offers",
          status: "active",
          OR: [{ startDate: null }, { startDate: { lte: now } }],
          AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
        },
        orderBy: { displayOrder: "asc" },
      }),
      prisma.coupon.findMany({
        where: { status: "active", startDate: { lte: now }, endDate: { gte: now } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    res.json({
      success: true,
      data: {
        banners,
        coupons: coupons.map((c) => ({
          id: c.id,
          code: c.code,
          type: c.type,
          value: Number(c.value).toString(),
          minOrderAmount: Number(c.minOrderAmount).toString(),
          maxDiscountAmount: c.maxDiscountAmount ? Number(c.maxDiscountAmount).toString() : null,
          description: c.description,
          endDate: c.endDate,
        })),
      },
    });
  })
);

// GET /api/offers/:id - single offer banner
offersRouter.get(
  "/:id",
  asyncH(async (req, res) => {
    const banner = await prisma.banner.findUnique({ where: { id: req.params.id } });
    if (!banner || banner.status !== "active") throw NotFound("Offer not found");
    res.json({ success: true, data: banner });
  })
);
