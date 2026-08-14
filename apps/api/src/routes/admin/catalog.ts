import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncH } from "../../lib/async";
import { BadRequest, NotFound } from "../../lib/errors";
import { genSku, paginate, productCard, productInclude, round2, slugify } from "../../lib/helpers";
import { cacheBustAll } from "../../lib/cache";
import { adminRequired, can } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { parseCsv } from "../../lib/csv";
import { logActivity } from "../../lib/activity";
import { lowStockThreshold } from "../../lib/settings";

export const adminCatalogRouter = Router();

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

const productSchema = z.object({
  name: z.string().min(2),
  sku: z.string().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  brandId: z.string().uuid().nullable().optional(),
  price: z.number().positive(),
  mrp: z.number().positive().optional(),
  costPrice: z.number().nonnegative().optional(),
  boxPrice: z.number().positive().nullable().optional(),
  boxQuantity: z.number().int().min(1).nullable().optional(),
  hsnCode: z.string().max(16).nullable().optional(),
  stockQuantity: z.number().int().min(0).default(0),
  description: z.string().optional(),
  shortDescription: z.string().optional(),
  weight: z.number().positive().optional(),
  dimensions: z.string().optional(),
  isFeatured: z.boolean().optional(),
  isNew: z.boolean().optional(),
  isBestSeller: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  metaKeywords: z.string().optional(),
  images: z.array(z.string().url()).max(8).optional(),
  attributes: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  tags: z.array(z.string()).optional(),
});

const stockStatusFor = (qty: number) => (qty > 10 ? "in_stock" : qty > 0 ? "low_stock" : "out_of_stock");

async function ensureUniqueSlug(base: string): Promise<string> {
  const slug = slugify(base);
  if (!(await prisma.product.findUnique({ where: { slug } }))) return slug;
  return `${slug}-${Math.random().toString(36).slice(2, 6)}`;
}

// GET /api/admin/products
adminCatalogRouter.get(
  "/products",
  adminRequired,
  asyncH(async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const { q, status, categoryId, brandId } = req.query;
    const where: any = {};
    if (q) where.OR = [{ name: { contains: String(q), mode: "insensitive" } }, { sku: { contains: String(q), mode: "insensitive" } }];
    if (status) where.status = String(status);
    if (categoryId) where.categoryId = String(categoryId);
    if (brandId) where.brandId = String(brandId);
    const [total, items] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({ where, include: productInclude, orderBy: { createdAt: "desc" }, skip, take }),
    ]);
    res.json({
      success: true,
      data: {
        items: items.map((p) => ({ ...productCard(p), createdAt: p.createdAt })),
        total,
        page,
        pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  })
);

// POST /api/admin/products
adminCatalogRouter.post(
  "/products",
  adminRequired,
  can("products.edit"),
  validate(productSchema),
  asyncH(async (req, res) => {
    const d = req.body;
    const sku = d.sku?.trim() || genSku();
    const slug = await ensureUniqueSlug(d.name);
    const product = await prisma.product.create({
      data: {
        name: d.name,
        sku,
        slug,
        categoryId: d.categoryId ?? null,
        brandId: d.brandId ?? null,
        price: d.price,
        mrp: d.mrp ?? null,
        costPrice: d.costPrice ?? null,
        boxPrice: d.boxPrice ?? null,
        boxQuantity: d.boxQuantity ?? null,
        hsnCode: d.hsnCode ?? null,
        stockQuantity: d.stockQuantity,
        stockStatus: stockStatusFor(d.stockQuantity) as any,
        description: d.description ?? null,
        shortDescription: d.shortDescription ?? null,
        weight: d.weight ?? null,
        dimensions: d.dimensions ?? null,
        isFeatured: d.isFeatured ?? false,
        isNew: d.isNew ?? false,
        isBestSeller: d.isBestSeller ?? false,
        status: d.status ?? "active",
        metaTitle: d.metaTitle ?? null,
        metaDescription: d.metaDescription ?? null,
        metaKeywords: d.metaKeywords ?? null,
        images: { create: (d.images ?? []).map((url: string, i: number) => ({ url, isPrimary: i === 0, displayOrder: i })) },
        attributes: { create: (d.attributes ?? []).map((a: any, i: number) => ({ name: a.name, value: a.value, displayOrder: i })) },
        tags: { connectOrCreate: (d.tags ?? []).map((t: string) => ({ where: { name: t }, create: { name: t } })) },
      },
      include: { images: true, brand: true, category: true },
    });
    await logActivity(req, "product.create", "product", product.id);
    cacheBustAll();
    res.json({ success: true, data: product });
  })
);

// PUT /api/admin/products/:id
adminCatalogRouter.put(
  "/products/:id",
  adminRequired,
  can("products.edit"),
  validate(productSchema.partial()),
  asyncH(async (req, res) => {
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) throw NotFound("Product not found");
    const d = req.body;
    const data: any = {};
    const scalarKeys = [
      "name", "sku", "categoryId", "brandId", "price", "mrp", "costPrice",
      "boxPrice", "boxQuantity", "hsnCode", "stockQuantity",
      "description", "shortDescription", "weight", "dimensions", "isFeatured", "isNew",
      "isBestSeller", "status", "metaTitle", "metaDescription", "metaKeywords",
    ];
    for (const k of scalarKeys) if (d[k] !== undefined) data[k] = d[k];
    if (d.stockQuantity !== undefined) data.stockStatus = stockStatusFor(d.stockQuantity) as any;
    if (d.categoryId === null) data.categoryId = null;
    if (d.brandId === null) data.brandId = null;

    const product = await prisma.$transaction(async (tx) => {
      if (d.images) {
        await tx.productImage.deleteMany({ where: { productId: existing.id } });
        await tx.productImage.createMany({
          data: d.images.map((url: string, i: number) => ({ productId: existing.id, url, isPrimary: i === 0, displayOrder: i })),
        });
      }
      if (d.attributes) {
        await tx.productAttribute.deleteMany({ where: { productId: existing.id } });
        await tx.productAttribute.createMany({
          data: d.attributes.map((a: any, i: number) => ({ productId: existing.id, name: a.name, value: a.value, displayOrder: i })),
        });
      }
      if (d.tags) {
        await tx.product.update({ where: { id: existing.id }, data: { tags: { set: [] } } });
        await tx.product.update({
          where: { id: existing.id },
          data: { tags: { connectOrCreate: d.tags.map((t: string) => ({ where: { name: t }, create: { name: t } })) } },
        });
      }
      return tx.product.update({
        where: { id: existing.id },
        data,
        include: { images: true, brand: true, category: true },
      });
    });
    await logActivity(req, "product.update", "product", product.id);
    cacheBustAll();
    res.json({ success: true, data: product });
  })
);

// DELETE /api/admin/products/:id
adminCatalogRouter.delete(
  "/products/:id",
  adminRequired,
  can("products.edit"),
  asyncH(async (req, res) => {
    await prisma.product.delete({ where: { id: req.params.id } });
    await logActivity(req, "product.delete", "product", req.params.id);
    cacheBustAll();
    res.json({ success: true, data: { message: "Product deleted" } });
  })
);

// POST /api/admin/products/import - bulk CSV import
adminCatalogRouter.post(
  "/products/import",
  adminRequired,
  can("products.edit"),
  asyncH(async (req, res) => {
    const csv = typeof req.body === "string" ? req.body : (req.body as any)?.csv;
    if (!csv) throw BadRequest("Send CSV content in the request body (text/csv). Columns: name, sku, price, mrp, stockQuantity, description, brand, category");
    const rows = parseCsv(csv);
    if (!rows.length) throw BadRequest("CSV is empty or missing a header row");

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        const name = row["name"];
        const sku = row["sku"];
        const price = Number(row["price"]);
        if (!name || !sku || !Number.isFinite(price)) {
          failed++;
          errors.push(`Row missing name/sku/price: ${JSON.stringify(row).slice(0, 120)}`);
          continue;
        }
        const stockQuantity = Number(row["stockquantity"] ?? row["stock"] ?? 0);
        const boxQuantity = row["boxquantity"] ? Number(row["boxquantity"]) : null;
        const boxPrice = row["boxprice"] ? Number(row["boxprice"]) : null;
        let brandId: string | null = null;
        if (row["brand"]) {
          const brand = await prisma.brand.findUnique({ where: { slug: slugify(row["brand"]) } });
          brandId = brand?.id ?? null;
        }
        let categoryId: string | null = null;
        if (row["category"]) {
          const category = await prisma.category.findUnique({ where: { slug: slugify(row["category"]) } });
          categoryId = category?.id ?? null;
        }
        const existing = await prisma.product.findUnique({ where: { sku } });
        const bulkFields = { boxPrice, boxQuantity, hsnCode: row["hsncode"] ?? row["hsn"] ?? null };
        if (existing) {
          await prisma.product.update({
            where: { id: existing.id },
            data: { name, price, mrp: row["mrp"] ? Number(row["mrp"]) : null, stockQuantity, brandId, categoryId, description: row["description"] ?? null, ...bulkFields },
          });
          updated++;
        } else {
          await prisma.product.create({
            data: {
              name, sku, price,
              mrp: row["mrp"] ? Number(row["mrp"]) : null,
              stockQuantity,
              stockStatus: stockStatusFor(stockQuantity) as any,
              brandId, categoryId,
              description: row["description"] ?? null,
              ...bulkFields,
              slug: await ensureUniqueSlug(name),
            },
          });
          created++;
        }
      } catch (e: any) {
        failed++;
        errors.push(e.message);
      }
    }
    await logActivity(req, "product.import", "product");
    cacheBustAll();
    res.json({ success: true, data: { created, updated, failed, errors: errors.slice(0, 20) } });
  })
);

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const categorySchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  description: z.string().optional(),
  parentId: z.string().uuid().nullable().optional(),
  imageUrl: z.string().optional(),
  displayOrder: z.number().int().optional(),
  status: z.string().optional(),
});

adminCatalogRouter.get(
  "/categories",
  adminRequired,
  asyncH(async (_req, res) => {
    const categories = await prisma.category.findMany({
      include: { _count: { select: { products: true } }, children: { include: { _count: { select: { products: true } } } } },
      orderBy: { displayOrder: "asc" },
    });
    res.json({ success: true, data: categories });
  })
);

adminCatalogRouter.post(
  "/categories",
  adminRequired,
  can("products.edit"),
  validate(categorySchema),
  asyncH(async (req, res) => {
    const d = req.body;
    const category = await prisma.category.create({
      data: {
        name: d.name,
        slug: d.slug || slugify(d.name),
        description: d.description ?? null,
        parentId: d.parentId ?? null,
        imageUrl: d.imageUrl ?? null,
        displayOrder: d.displayOrder ?? 0,
        status: d.status ?? "active",
      },
    });
    await logActivity(req, "category.create", "category", category.id);
    cacheBustAll();
    res.json({ success: true, data: category });
  })
);

adminCatalogRouter.put(
  "/categories/:id",
  adminRequired,
  can("products.edit"),
  validate(categorySchema.partial()),
  asyncH(async (req, res) => {
    const category = await prisma.category.update({ where: { id: req.params.id }, data: req.body });
    await logActivity(req, "category.update", "category", category.id);
    cacheBustAll();
    res.json({ success: true, data: category });
  })
);

adminCatalogRouter.delete(
  "/categories/:id",
  adminRequired,
  can("products.edit"),
  asyncH(async (req, res) => {
    await prisma.category.delete({ where: { id: req.params.id } });
    await logActivity(req, "category.delete", "category", req.params.id);
    cacheBustAll();
    res.json({ success: true, data: { message: "Category deleted" } });
  })
);

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

const brandSchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  description: z.string().optional(),
  logoUrl: z.string().optional(),
  website: z.string().optional(),
  displayOrder: z.number().int().optional(),
  status: z.string().optional(),
});

adminCatalogRouter.get(
  "/brands",
  adminRequired,
  asyncH(async (_req, res) => {
    const brands = await prisma.brand.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { displayOrder: "asc" },
    });
    res.json({ success: true, data: brands });
  })
);

adminCatalogRouter.post(
  "/brands",
  adminRequired,
  can("products.edit"),
  validate(brandSchema),
  asyncH(async (req, res) => {
    const d = req.body;
    const brand = await prisma.brand.create({
      data: {
        name: d.name,
        slug: d.slug || slugify(d.name),
        description: d.description ?? null,
        logoUrl: d.logoUrl ?? null,
        website: d.website ?? null,
        displayOrder: d.displayOrder ?? 0,
        status: d.status ?? "active",
      },
    });
    await logActivity(req, "brand.create", "brand", brand.id);
    cacheBustAll();
    res.json({ success: true, data: brand });
  })
);

adminCatalogRouter.put(
  "/brands/:id",
  adminRequired,
  can("products.edit"),
  validate(brandSchema.partial()),
  asyncH(async (req, res) => {
    const brand = await prisma.brand.update({ where: { id: req.params.id }, data: req.body });
    await logActivity(req, "brand.update", "brand", brand.id);
    cacheBustAll();
    res.json({ success: true, data: brand });
  })
);

adminCatalogRouter.delete(
  "/brands/:id",
  adminRequired,
  can("products.edit"),
  asyncH(async (req, res) => {
    await prisma.brand.delete({ where: { id: req.params.id } });
    await logActivity(req, "brand.delete", "brand", req.params.id);
    cacheBustAll();
    res.json({ success: true, data: { message: "Brand deleted" } });
  })
);

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

// GET /api/admin/inventory
adminCatalogRouter.get(
  "/inventory",
  adminRequired,
  asyncH(async (req, res) => {
    const { page, pageSize, skip, take } = paginate(req.query);
    const { q, lowStock } = req.query;
    const threshold = await lowStockThreshold();
    const where: any = {};
    if (q) where.OR = [{ name: { contains: String(q), mode: "insensitive" } }, { sku: { contains: String(q), mode: "insensitive" } }];
    if (lowStock === "true") where.stockQuantity = { lte: threshold };
    const [total, items] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        select: { id: true, name: true, sku: true, stockQuantity: true, stockStatus: true, price: true, costPrice: true, brand: { select: { name: true } } },
        orderBy: { stockQuantity: "asc" },
        skip,
        take,
      }),
    ]);
    res.json({
      success: true,
      data: {
        items: items.map((p) => ({ ...p, price: Number(p.price).toString(), costPrice: p.costPrice ? Number(p.costPrice).toString() : null, stockValue: round2(Number(p.costPrice ?? p.price) * p.stockQuantity).toString() })),
        total,
        page,
        pageSize,
        pages: Math.ceil(total / pageSize),
        threshold,
      },
    });
  })
);

// PUT /api/admin/inventory/update - batch stock adjustment
adminCatalogRouter.put(
  "/inventory/update",
  adminRequired,
  can("inventory.update"),
  validate(
    z.object({
      items: z
        .array(
          z.object({
            productId: z.string().uuid(),
            quantity: z.number().int().min(0),
            type: z.enum(["stock_in", "stock_out", "adjustment"]),
            reason: z.string().optional(),
          })
        )
        .min(1),
    })
  ),
  asyncH(async (req, res) => {
    const userId = (req as any).user.id;
    const results = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const item of req.body.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw NotFound(`Product ${item.productId} not found`);
        const delta =
          item.type === "stock_in" ? item.quantity : item.type === "stock_out" ? -item.quantity : item.quantity - product.stockQuantity;
        const quantityAfter = Math.max(0, product.stockQuantity + delta);
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: quantityAfter, stockStatus: stockStatusFor(quantityAfter) as any },
        });
        await tx.inventoryLog.create({
          data: { productId: item.productId, change: delta, type: item.type, reason: item.reason ?? null, quantityAfter, userId },
        });
        out.push({ productId: item.productId, quantityAfter });
      }
      return out;
    });
    await logActivity(req, "inventory.update", "inventory");
    cacheBustAll();
    res.json({ success: true, data: { results } });
  })
);

// GET /api/admin/inventory/history
adminCatalogRouter.get(
  "/inventory/history",
  adminRequired,
  asyncH(async (req, res) => {
    const logs = await prisma.inventoryLog.findMany({
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({ success: true, data: logs });
  })
);
