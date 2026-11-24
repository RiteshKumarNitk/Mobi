import { defineRoute } from "@/lib/route";
import { prisma } from "../lib/prisma";
import { paginate, productCard, productInclude } from "../lib/helpers";
import { cached } from "../lib/cache";

// GET /api/search?q=&page=
export const getSearch = defineRoute(
  async (req, res) => {
    const q = String(req.query.q ?? "").trim().slice(0, 100);
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
    return res.json({ success: true, data: { items: items.map(productCard), total, page, pageSize, pages: Math.ceil(total / pageSize) } });
  }
);

// GET /api/search/suggest?q=
export const getSuggest = defineRoute(
  async (req, res) => {
    const q = String(req.query.q ?? "").trim().slice(0, 100);
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
    return res.json({ success: true, data });
  }
);
