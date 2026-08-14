import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncH } from "../lib/async";
import { NotFound } from "../lib/errors";
import { paginate, productCard, productInclude } from "../lib/helpers";
import { cached } from "../lib/cache";

export const productsRouter = Router();

function sortOrder(sort: unknown): any {
  switch (sort) {
    case "price_asc":
      return [{ price: "asc" }];
    case "price_desc":
      return [{ price: "desc" }];
    case "newest":
      return [{ createdAt: "desc" }];
    case "best_selling":
      return [{ orderItems: { _count: "desc" } }, { createdAt: "desc" }];
    case "name_asc":
      return [{ name: "asc" }];
    case "name_desc":
      return [{ name: "desc" }];
    default:
      return [{ createdAt: "desc" }];
  }
}

// GET /api/products - filtered, sorted, paginated
productsRouter.get(
  "/",
  asyncH(async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const { q, categoryId, brandId, minPrice, maxPrice, stock, sort, featured, isNew, isBestSeller, ids } = req.query;
    const where: any = { status: "active" };

    if (q) {
      where.OR = [
        { name: { contains: String(q), mode: "insensitive" } },
        { sku: { contains: String(q), mode: "insensitive" } },
        { brand: { name: { contains: String(q), mode: "insensitive" } } },
      ];
    }
    if (categoryId) {
      where.category = { OR: [{ id: String(categoryId) }, { parentId: String(categoryId) }] };
    }
    if (brandId) where.brandId = String(brandId);
    if (minPrice) where.price = { ...(where.price ?? {}), gte: Number(minPrice) };
    if (maxPrice) where.price = { ...(where.price ?? {}), lte: Number(maxPrice) };
    if (stock === "in") where.stockQuantity = { gt: 0 };
    if (stock === "out") where.stockQuantity = 0;
    if (featured === "true") where.isFeatured = true;
    if (isNew === "true") where.isNew = true;
    if (isBestSeller === "true") where.isBestSeller = true;
    if (ids) where.id = { in: String(ids).split(",") };

    const key = `catalog:products:list:${JSON.stringify({ q, categoryId, brandId, minPrice, maxPrice, stock, sort, featured, isNew, isBestSeller, ids, page, pageSize })}`;
    const data = await cached(key, 60, async () => {
      const [total, items] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({ where, include: productInclude, orderBy: sortOrder(sort), skip, take }),
      ]);
      return { items: items.map(productCard), total, page, pageSize, pages: Math.ceil(total / pageSize) };
    }, res);

    res.json({ success: true, data });
  })
);

// Static sub-routes MUST be declared before /:id
productsRouter.get(
  "/featured",
  asyncH(async (_req, res) => {
    const items = await cached("catalog:products:featured", 60, async () => {
      const found = await prisma.product.findMany({
        where: { status: "active", isFeatured: true },
        include: productInclude,
        orderBy: { createdAt: "desc" },
        take: 12,
      });
      return found.map(productCard);
    }, res);
    res.json({ success: true, data: items });
  })
);

productsRouter.get(
  "/trending",
  asyncH(async (_req, res) => {
    const items = await cached("catalog:products:trending", 60, async () => {
      const found = await prisma.product.findMany({
        where: { status: "active", isBestSeller: true },
        include: productInclude,
        orderBy: { createdAt: "desc" },
        take: 12,
      });
      return found.map(productCard);
    }, res);
    res.json({ success: true, data: items });
  })
);

productsRouter.get(
  "/new",
  asyncH(async (_req, res) => {
    const items = await cached("catalog:products:new", 60, async () => {
      const found = await prisma.product.findMany({
        where: { status: "active", isNew: true },
        include: productInclude,
        orderBy: { createdAt: "desc" },
        take: 12,
      });
      return found.map(productCard);
    }, res);
    res.json({ success: true, data: items });
  })
);

// GET /api/products/:id
productsRouter.get(
  "/:id",
  asyncH(async (req, res) => {
    const product = await cached(`catalog:products:id:${req.params.id}`, 120, async () => {
      const found = await prisma.product.findUnique({
        where: { id: req.params.id },
        include: {
          ...productInclude,
          attributes: { orderBy: { displayOrder: "asc" } },
          tags: true,
        },
      });
      if (!found || found.status !== "active") throw NotFound("Product not found");
      const reviewAgg = await prisma.review.aggregate({
        where: { productId: found.id, status: "approved" },
        _avg: { rating: true },
        _count: true,
      });
      return {
        ...productCard(found),
        description: found.description,
        shortDescription: found.shortDescription,
        attributes: found.attributes,
        tags: found.tags.map((t) => t.name),
        gallery: found.images.map((i) => ({ url: i.url, isPrimary: i.isPrimary })),
        rating: Number(reviewAgg._avg.rating ?? 0),
        reviewCount: reviewAgg._count,
      };
    }, res);
    res.json({ success: true, data: product });
  })
);

// GET /api/products/:id/related
productsRouter.get(
  "/:id/related",
  asyncH(async (req, res) => {
    const items = await cached(`catalog:products:related:${req.params.id}`, 120, async () => {
      const product = await prisma.product.findUnique({ where: { id: req.params.id } });
      if (!product) throw NotFound("Product not found");
      const found = await prisma.product.findMany({
        where: {
          status: "active",
          id: { not: product.id },
          OR: [{ categoryId: product.categoryId }, { brandId: product.brandId }],
        },
        include: productInclude,
        orderBy: { createdAt: "desc" },
        take: 8,
      });
      return found.map(productCard);
    }, res);
    res.json({ success: true, data: items });
  })
);
