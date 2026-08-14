import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncH } from "../lib/async";
import { Forbidden, NotFound } from "../lib/errors";
import { authRequired, isAdminRole } from "../middleware/auth";
import { validate } from "../middleware/validate";

/** Product reviews - mounted at /api/products/:id/reviews per API spec */
export const productReviewsRouter = Router();

// GET /api/products/:id/reviews
productReviewsRouter.get(
  "/:id/reviews",
  asyncH(async (req, res) => {
    const { rating } = req.query;
    const where: any = { productId: req.params.id, status: "approved" };
    if (rating) where.rating = Number(rating);
    const reviews = await prisma.review.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });
    const agg = await prisma.review.aggregate({
      where: { productId: req.params.id, status: "approved" },
      _avg: { rating: true },
      _count: true,
    });
    res.json({
      success: true,
      data: {
        reviews: reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          title: r.title,
          comment: r.comment,
          images: (r.images as string[]) ?? [],
          helpfulCount: r.helpfulCount,
          createdAt: r.createdAt,
          user: {
            name: [r.user.firstName, r.user.lastName].filter(Boolean).join(" ") || "Customer",
            shopName: r.user.shopName,
          },
        })),
        averageRating: Number(agg._avg.rating ?? 0),
        total: agg._count,
      },
    });
  })
);

// POST /api/products/:id/reviews
productReviewsRouter.post(
  "/:id/reviews",
  authRequired,
  validate(
    z.object({
      rating: z.number().int().min(1).max(5),
      title: z.string().max(200).optional(),
      comment: z.string().min(3).max(2000).optional(),
      images: z.array(z.string().url()).max(5).optional(),
    })
  ),
  asyncH(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) throw NotFound("Product not found");
    const review = await prisma.review.create({
      data: {
        productId: product.id,
        userId: (req as any).user.id,
        rating: req.body.rating,
        title: req.body.title ?? null,
        comment: req.body.comment ?? null,
        images: req.body.images?.length ? req.body.images : null,
      },
    });
    res.json({
      success: true,
      data: { message: "Review submitted. It will appear after approval.", reviewId: review.id },
    });
  })
);

/** Review actions - mounted at /api/reviews */
export const reviewsRouter = Router();

reviewsRouter.use(authRequired);

// PUT /api/reviews/:id - owner edits own review
reviewsRouter.put(
  "/:id",
  authRequired,
  validate(z.object({ rating: z.number().int().min(1).max(5).optional(), title: z.string().max(200).optional(), comment: z.string().min(3).max(2000).optional() })),
  asyncH(async (req, res) => {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) throw NotFound("Review not found");
    if (review.userId !== (req as any).user.id) throw Forbidden();
    const updated = await prisma.review.update({
      where: { id: review.id },
      data: { ...req.body, status: "pending" },
    });
    res.json({ success: true, data: { message: "Review updated. It will be re-approved.", review: updated } });
  })
);

// DELETE /api/reviews/:id - owner or admin
reviewsRouter.delete(
  "/:id",
  authRequired,
  asyncH(async (req, res) => {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) throw NotFound("Review not found");
    const user = (req as any).user;
    if (review.userId !== user.id && !isAdminRole(user.role)) throw Forbidden();
    await prisma.review.delete({ where: { id: review.id } });
    res.json({ success: true, data: { message: "Review deleted" } });
  })
);

// POST /api/reviews/:id/helpful - toggle helpful vote
reviewsRouter.post(
  "/:id/helpful",
  authRequired,
  asyncH(async (req, res) => {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) throw NotFound("Review not found");
    const userId = (req as any).user.id;
    const existing = await prisma.reviewHelpful.findUnique({
      where: { reviewId_userId: { reviewId: review.id, userId } },
    });
    if (existing) {
      await prisma.reviewHelpful.delete({ where: { id: existing.id } });
      await prisma.review.update({ where: { id: review.id }, data: { helpfulCount: { decrement: 1 } } });
      res.json({ success: true, data: { helpful: false } });
    } else {
      await prisma.reviewHelpful.create({ data: { reviewId: review.id, userId } });
      await prisma.review.update({ where: { id: review.id }, data: { helpfulCount: { increment: 1 } } });
      res.json({ success: true, data: { helpful: true } });
    }
  })
);
