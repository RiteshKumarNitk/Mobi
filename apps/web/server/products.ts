import { defineRoute } from "@/lib/route";
import { prisma } from "../lib/prisma";
import { NotFound } from "../lib/errors";
import { paginate, productCard, productInclude } from "../lib/helpers";
import { cached } from "../lib/cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
export const getProducts = defineRoute(
  async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const str = (v: unknown, max = 100) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
    const uuid = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v : undefined);
    const money = (v: unknown) => {
      const n = typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    const q = str(req.query.q);
    const categoryId = uuid(req.query.categoryId);
    const brandId = uuid(req.query.brandId);
    const minPrice = money(req.query.minPrice);
    const maxPrice = money(req.query.maxPrice);
    const { stock, sort, featured, isNew, isBestSeller } = req.query;
    // Recently-viewed lookups: at most 50 well-formed ids.
    const ids = typeof req.query.ids === "string" ? req.query.ids.split(",").filter((s) => UUID_RE.test(s)).slice(0, 50).join(",") || undefined : undefined;
    const where: any = { status: "active" };

    // A malformed id filter must return nothing, not every product.
    if ((req.query.categoryId && !categoryId) || (req.query.brandId && !brandId)) {
      return res.json({ success: true, data: { items: [], total: 0, page, pageSize, pages: 0 } });
    }

    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { brand: { name: { contains: q, mode: "insensitive" } } },
      ];
    }
    if (categoryId) {
      where.category = { OR: [{ id: categoryId }, { parentId: categoryId }] };
    }
    if (brandId) where.brandId = brandId;
    if (minPrice !== undefined) where.price = { ...(where.price ?? {}), gte: minPrice };
    if (maxPrice !== undefined) where.price = { ...(where.price ?? {}), lte: maxPrice };
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

    return res.json({ success: true, data });
  }
);

// Static sub-routes MUST be declared before /:id
export const getFeatured = defineRoute(
  async (_req, res) => {
    const items = await cached("catalog:products:featured", 60, async () => {
      const found = await prisma.product.findMany({
        where: { status: "active", isFeatured: true },
        include: productInclude,
        orderBy: { createdAt: "desc" },
        take: 12,
      });
      return found.map(productCard);
    }, res);
    return res.json({ success: true, data: items });
  }
);

export const getTrending = defineRoute(
  async (_req, res) => {
    const items = await cached("catalog:products:trending", 60, async () => {
      const found = await prisma.product.findMany({
        where: { status: "active", isBestSeller: true },
        include: productInclude,
        orderBy: { createdAt: "desc" },
        take: 12,
      });
      return found.map(productCard);
    }, res);
    return res.json({ success: true, data: items });
  }
);

export const getNew = defineRoute(
  async (_req, res) => {
    const items = await cached("catalog:products:new", 60, async () => {
      const found = await prisma.product.findMany({
        where: { status: "active", isNew: true },
        include: productInclude,
        orderBy: { createdAt: "desc" },
        take: 12,
      });
      return found.map(productCard);
    }, res);
    return res.json({ success: true, data: items });
  }
);

// GET /api/products/:id
export const getSlug = defineRoute(
  async (req, res) => {
    const product = await cached(`catalog:products:id:${req.params.slug}`, 120, async () => {
      const found = await prisma.product.findFirst({
        where: { OR: [{ id: req.params.slug }, { slug: req.params.slug }] },
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
    return res.json({ success: true, data: product });
  }
);

// GET /api/products/:id/related
export const getIdRelated = defineRoute(
  async (req, res) => {
    const items = await cached(`catalog:products:related:${req.params.slug}`, 120, async () => {
      const product = await prisma.product.findUnique({ where: { id: req.params.slug } });
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
    return res.json({ success: true, data: items });
  }
);
