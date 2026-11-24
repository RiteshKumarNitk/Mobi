import { defineRoute } from "@/lib/route";
import { prisma } from "../lib/prisma";
import { NotFound } from "../lib/errors";
import { paginate, productCard, productInclude } from "../lib/helpers";
import { cached } from "../lib/cache";

// GET /api/brands
export const getBrands = defineRoute(
  async (_req, res) => {
    const brands = await cached("catalog:brands", 300, async () => {
      const found = await prisma.brand.findMany({
        where: { status: "active" },
        include: { _count: { select: { products: true } } },
        orderBy: { displayOrder: "asc" },
      });
      return found;
    }, res);
    return res.json({ success: true, data: brands });
  }
);

// GET /api/brands/:id
export const getId = defineRoute(
  async (req, res) => {
    const brand = await cached(`catalog:brands:id:${req.params.id}`, 300, async () => {
      const found = await prisma.brand.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { products: true } } },
      });
      if (!found || found.status !== "active") throw NotFound("Brand not found");
      return found;
    }, res);
    return res.json({ success: true, data: brand });
  }
);

// GET /api/brands/:id/products
export const getIdProducts = defineRoute(
  async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const data = await cached(`catalog:brands:${req.params.id}:products:${page}:${pageSize}`, 60, async () => {
      const brand = await prisma.brand.findUnique({ where: { id: req.params.id } });
      if (!brand) throw NotFound("Brand not found");
      const where: any = { status: "active", brandId: brand.id };
      const [total, items] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({ where, include: productInclude, orderBy: { createdAt: "desc" }, skip, take }),
      ]);
      return { brand: { id: brand.id, name: brand.name, slug: brand.slug }, items: items.map(productCard), total, page, pageSize, pages: Math.ceil(total / pageSize) };
    }, res);
    return res.json({ success: true, data });
  }
);
