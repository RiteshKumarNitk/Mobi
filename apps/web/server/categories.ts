import { defineRoute } from "@/lib/route";
import { prisma } from "../lib/prisma";
import { NotFound } from "../lib/errors";
import { paginate, productCard, productInclude } from "../lib/helpers";
import { cached } from "../lib/cache";

// GET /api/categories - all active categories with children + product counts
export const getCategories = defineRoute(
  async (_req, res) => {
    const categories = await cached("catalog:categories", 300, async () => {
      const found = await prisma.category.findMany({
        where: { status: "active" },
        include: {
          _count: { select: { products: true } },
          children: {
            where: { status: "active" },
            include: { _count: { select: { products: true } } },
            orderBy: { displayOrder: "asc" },
          },
        },
        orderBy: { displayOrder: "asc" },
      });
      return found;
    }, res);
    return res.json({ success: true, data: categories });
  }
);

// GET /api/categories/:id
export const getId = defineRoute(
  async (req, res) => {
    const category = await cached(`catalog:categories:id:${req.params.id}`, 300, async () => {
      const found = await prisma.category.findUnique({
        where: { id: req.params.id },
        include: {
          parent: true,
          children: { where: { status: "active" } },
          _count: { select: { products: true } },
        },
      });
      if (!found || found.status !== "active") throw NotFound("Category not found");
      return found;
    }, res);
    return res.json({ success: true, data: category });
  }
);

// GET /api/categories/:id/products
export const getIdProducts = defineRoute(
  async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const data = await cached(`catalog:categories:${req.params.id}:products:${page}:${pageSize}`, 60, async () => {
      const category = await prisma.category.findUnique({ where: { id: req.params.id } });
      if (!category) throw NotFound("Category not found");
      const where: any = { status: "active", category: { OR: [{ id: category.id }, { parentId: category.id }] } };
      const [total, items] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({ where, include: productInclude, orderBy: { createdAt: "desc" }, skip, take }),
      ]);
      return { category: { id: category.id, name: category.name, slug: category.slug }, items: items.map(productCard), total, page, pageSize, pages: Math.ceil(total / pageSize) };
    }, res);
    return res.json({ success: true, data });
  }
);
