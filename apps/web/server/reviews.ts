import { defineRoute } from "@/lib/route";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { Conflict, Forbidden, NotFound } from "../lib/errors";
import { rateLimit } from "../lib/rateLimit";
import { authRequired, isAdminRole } from "../lib/auth";
import { validate } from "../lib/validate";

/** Product reviews - mounted at /api/products/:id/reviews per API spec */

// GET /api/products/:id/reviews
export const getIdReviews = defineRoute(
  async (req, res) => {
    const { rating } = req.query;
    const where: any = { productId: req.params.slug, status: "approved" };
    const r = Number(rating);
    if (rating && Number.isInteger(r) && r >= 1 && r <= 5) where.rating = r;
    const reviews = await prisma.review.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true, shopName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const agg = await prisma.review.aggregate({
      where: { productId: req.params.slug, status: "approved" },
      _avg: { rating: true },
      _count: true,
    });
    return res.json({
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
  }
);

// POST /api/products/:id/reviews
export const postIdReviews = defineRoute(
  authRequired,
  rateLimit({ max: 10 }),
  validate(
    z.object({
      rating: z.number().int().min(1).max(5),
      title: z.string().max(200).optional(),
      comment: z.string().min(3).max(2000).optional(),
      images: z.array(z.string().url()).max(5).optional(),
    })
  ),
  async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.slug } });
    if (!product || product.status !== "active") throw NotFound("Product not found");
    const userId = req.user!.id;
    // One review per customer per product (edit the existing one instead).
    if (await prisma.review.findFirst({ where: { productId: product.id, userId } })) {
      throw Conflict("You have already reviewed this product");
    }
    const review = await prisma.review.create({
      data: {
        productId: product.id,
        userId: req.user!.id,
        rating: req.body.rating,
        title: req.body.title ?? null,
        comment: req.body.comment ?? null,
        images: req.body.images?.length ? req.body.images : null,
      },
    });
    return res.json({
      success: true,
      data: { message: "Review submitted. It will appear after approval.", reviewId: review.id },
    });
  }
);

/** Review actions - mounted at /api/reviews */

// PUT /api/reviews/:id - owner edits own review
export const putId = defineRoute(
  authRequired,
  authRequired,
  validate(z.object({ rating: z.number().int().min(1).max(5).optional(), title: z.string().max(200).optional(), comment: z.string().min(3).max(2000).optional() })),
  async (req, res) => {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) throw NotFound("Review not found");
    if (review.userId !== req.user!.id) throw Forbidden();
    const updated = await prisma.review.update({
      where: { id: review.id },
      data: { ...req.body, status: "pending" },
    });
    return res.json({ success: true, data: { message: "Review updated. It will be re-approved.", review: updated } });
  }
);

// DELETE /api/reviews/:id - owner or admin
export const deleteId = defineRoute(
  authRequired,
  authRequired,
  async (req, res) => {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) throw NotFound("Review not found");
    const user = req.user!;
    if (review.userId !== user.id && !isAdminRole(user.role)) throw Forbidden();
    await prisma.review.delete({ where: { id: review.id } });
    return res.json({ success: true, data: { message: "Review deleted" } });
  }
);

// POST /api/reviews/:id/helpful - toggle helpful vote
export const postIdHelpful = defineRoute(
  authRequired,
  authRequired,
  async (req, res) => {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) throw NotFound("Review not found");
    const userId = req.user!.id;
    const existing = await prisma.reviewHelpful.findUnique({
      where: { reviewId_userId: { reviewId: review.id, userId } },
    });
    if (existing) {
      await prisma.reviewHelpful.delete({ where: { id: existing.id } });
      await prisma.review.update({ where: { id: review.id }, data: { helpfulCount: { decrement: 1 } } });
      return res.json({ success: true, data: { helpful: false } });
    } else {
      await prisma.reviewHelpful.create({ data: { reviewId: review.id, userId } });
      await prisma.review.update({ where: { id: review.id }, data: { helpfulCount: { increment: 1 } } });
      return res.json({ success: true, data: { helpful: true } });
    }
  }
);
