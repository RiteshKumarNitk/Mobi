import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncH } from "../lib/async";
import { paginate, productCard, productInclude } from "../lib/helpers";
import { cached } from "../lib/cache";

export const searchRouter = Router();

// GET /api/search?q=&page=
searchRouter.get(
  "/",
  asyncH(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.json({ success: true, data: { items: [], total: 0, page: 1, pageSize: 20, pages: 0 } });
    const { page, pageSize, skip, take } = paginate(req.query);
    const where: any = {
      status: "active",
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { brand: { name: { contains: q, mode: "insensitive" } } },
      ],
    };
    const [total, items] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({ where, include: productInclude, orderBy: { createdAt: "desc" }, skip, take }),
    ]);
    res.json({ success: true, data: { items: items.map(productCard), total, page, pageSize, pages: Math.ceil(total / pageSize) } });
  })
);

// GET /api/search/suggest?q=
searchRouter.get(
  "/suggest",
  asyncH(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json({ success: true, data: { products: [], categories: [], brands: [] } });
    const data = await cached(`catalog:suggest:${q.toLowerCase()}`, 60, async () => {
      const [products, categories, brands] = await Promise.all([
        prisma.product.findMany({
          where: { status: "active", OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] },
          include: productInclude,
          take: 6,
        }),
        prisma.category.findMany({ where: { status: "active", name: { contains: q, mode: "insensitive" } }, take: 4 }),
        prisma.brand.findMany({ where: { status: "active", name: { contains: q, mode: "insensitive" } }, take: 4 }),
      ]);
      return {
        products: products.map(productCard),
        categories,
        brands,
      };
    }, res);
    res.json({ success: true, data });
  })
);
