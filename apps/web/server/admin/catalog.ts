import { defineRoute } from "@/lib/route";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { BadRequest, NotFound } from "../../lib/errors";
import { genSku, paginate, productCard, productInclude, round2, slugify } from "../../lib/helpers";
import { cacheBustAll } from "../../lib/cache";
import { adminRequired, can } from "../../lib/auth";
import { validate } from "../../lib/validate";
import { parseCsv } from "../../lib/csv";
import { logActivity } from "../../lib/activity";
import { lowStockThreshold } from "../../lib/settings";
import { stockStatusFor } from "../../lib/stock";

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

const productBase = z.object({
  name: z.string().trim().min(2).max(200),
  sku: z.string().trim().max(64).regex(/^[A-Za-z0-9._-]*$/, "SKU may contain letters, digits, . _ - only").optional(),
  categoryId: z.string().uuid().nullable().optional(),
  brandId: z.string().uuid().nullable().optional(),
  price: z.number().positive().max(10_000_000),
  mrp: z.number().positive().max(10_000_000).optional(),
  costPrice: z.number().nonnegative().optional(),
  boxPrice: z.number().positive().nullable().optional(),
  boxQuantity: z.number().int().min(1).nullable().optional(),
  hsnCode: z.string().max(16).nullable().optional(),
  stockQuantity: z.number().int().min(0).max(10_000_000).default(0),
  description: z.string().max(20_000).optional(),
  shortDescription: z.string().max(1000).optional(),
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
  attributes: z.array(z.object({ name: z.string().max(100), value: z.string().max(500) })).max(50).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
});

/** Bulk (box) pricing needs both fields, a box of 2+ units, and a box price not above the unit price. */
function bulkPricingIssue(d: { price?: number; boxPrice?: number | null; boxQuantity?: number | null }): string | null {
  const hasPrice = d.boxPrice != null;
  const hasQty = d.boxQuantity != null;
  if (hasPrice !== hasQty) return "Bulk pricing needs both boxPrice and boxQuantity (or neither)";
  if (hasQty && d.boxQuantity! < 2) return "boxQuantity must be at least 2";
  if (hasPrice && d.price != null && d.boxPrice! > d.price) return "boxPrice (per unit) cannot be higher than the regular price";
  return null;
}

const productSchema = productBase.superRefine((d, ctx) => {
  const issue = bulkPricingIssue(d);
  if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue, path: ["boxPrice"] });
});

async function ensureUniqueSlug(base: string): Promise<string> {
  const slug = slugify(base);
  if (!(await prisma.product.findUnique({ where: { slug } }))) return slug;
  return `${slug}-${Math.random().toString(36).slice(2, 6)}`;
}

// GET /api/admin/products
export const getProducts = defineRoute(
  adminRequired,
  async (req, res) => {
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
    return res.json({
      success: true,
      data: {
        items: items.map((p) => ({ ...productCard(p), createdAt: p.createdAt })),
        total,
        page,
        pageSize,
        pages: Math.ceil(total / pageSize),
      },
    });
  }
);

// POST /api/admin/products
export const postProducts = defineRoute(
  adminRequired,
  can("products.edit"),
  validate(productSchema),
  async (req, res) => {
    const d = req.body;
    const sku = d.sku?.trim() || genSku();
    const slug = await ensureUniqueSlug(d.name);
    const lowStock = await lowStockThreshold();
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
        stockStatus: stockStatusFor(d.stockQuantity, lowStock),
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
    return res.json({ success: true, data: product });
  }
);

// PUT /api/admin/products/:id
export const putProductsId = defineRoute(
  adminRequired,
  can("products.edit"),
  validate(productBase.partial()),
  async (req, res) => {
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) throw NotFound("Product not found");
    const d = req.body;
    const merged = {
      price: d.price ?? Number(existing.price),
      boxPrice: d.boxPrice !== undefined ? d.boxPrice : existing.boxPrice != null ? Number(existing.boxPrice) : null,
      boxQuantity: d.boxQuantity !== undefined ? d.boxQuantity : existing.boxQuantity,
    };
    const bulkIssue = bulkPricingIssue(merged);
    if (bulkIssue) throw BadRequest(bulkIssue, "VALIDATION");
    const lowStock = await lowStockThreshold();
    const data: any = {};
    const scalarKeys = [
      "name", "sku", "categoryId", "brandId", "price", "mrp", "costPrice",
      "boxPrice", "boxQuantity", "hsnCode", "stockQuantity",
      "description", "shortDescription", "weight", "dimensions", "isFeatured", "isNew",
      "isBestSeller", "status", "metaTitle", "metaDescription", "metaKeywords",
    ];
    for (const k of scalarKeys) if (d[k] !== undefined) data[k] = d[k];
    if (d.stockQuantity !== undefined) data.stockStatus = stockStatusFor(d.stockQuantity, lowStock);
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
      const updated = await tx.product.update({
        where: { id: existing.id },
        data,
        include: { images: true, brand: true, category: true },
      });
      // Direct stock edits are recorded in the inventory history like any other adjustment.
      if (d.stockQuantity !== undefined && d.stockQuantity !== existing.stockQuantity) {
        await tx.inventoryLog.create({
          data: { productId: existing.id, change: d.stockQuantity - existing.stockQuantity, type: "adjustment", reason: "Product edit", quantityAfter: d.stockQuantity, userId: req.user!.id },
        });
      }
      return updated;
    });
    await logActivity(req, "product.update", "product", product.id);
    cacheBustAll();
    return res.json({ success: true, data: product });
  }
);

// DELETE /api/admin/products/:id
export const deleteProductsId = defineRoute(
  adminRequired,
  can("products.edit"),
  async (req, res) => {
    await prisma.product.delete({ where: { id: req.params.id } });
    await logActivity(req, "product.delete", "product", req.params.id);
    cacheBustAll();
    return res.json({ success: true, data: { message: "Product deleted" } });
  }
);

// POST /api/admin/products/import - bulk CSV import
export const postProductsImport = defineRoute(
  adminRequired,
  can("products.edit"),
  async (req, res) => {
    const csv = typeof req.body === "string" ? req.body : (req.body as any)?.csv;
    if (!csv) throw BadRequest("Send CSV content in the request body (text/csv). Columns: name, sku, price, mrp, stockQuantity, description, brand, category");
    const rows = parseCsv(csv);
    if (!rows.length) throw BadRequest("CSV is empty or missing a header row");

    if (rows.length > 5000) throw BadRequest("CSV has too many rows (max 5000 per import)");

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];
    const lowStock = await lowStockThreshold();
    const num = (v: string | undefined) => (v == null || v.trim() === "" ? null : Number(v));

    for (const [index, row] of rows.entries()) {
      const rowNo = index + 2; // +1 header, +1 human numbering
      try {
        const name = (row["name"] ?? "").trim();
        const sku = (row["sku"] ?? "").trim();
        const price = num(row["price"]);
        const mrp = num(row["mrp"]);
        const stockQuantity = num(row["stockquantity"] ?? row["stock"]) ?? 0;
        const boxQuantity = num(row["boxquantity"]);
        const boxPrice = num(row["boxprice"]);
        const problems: string[] = [];
        if (name.length < 2 || name.length > 200) problems.push("name must be 2-200 characters");
        if (!/^[A-Za-z0-9._-]{1,64}$/.test(sku)) problems.push("sku is missing or invalid");
        if (price == null || !Number.isFinite(price) || price <= 0) problems.push("price must be a positive number");
        if (mrp != null && (!Number.isFinite(mrp) || mrp <= 0)) problems.push("mrp must be a positive number");
        if (!Number.isInteger(stockQuantity) || stockQuantity < 0) problems.push("stockQuantity must be a whole number >= 0");
        if (boxQuantity != null && !Number.isInteger(boxQuantity)) problems.push("boxQuantity must be a whole number");
        if (boxPrice != null && (!Number.isFinite(boxPrice) || boxPrice <= 0)) problems.push("boxPrice must be a positive number");
        const bulk = problems.length ? null : bulkPricingIssue({ price: price!, boxPrice, boxQuantity });
        if (bulk) problems.push(bulk);
        if (problems.length) {
          failed++;
          errors.push(`Row ${rowNo}: ${problems.join("; ")}`);
          continue;
        }
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
            data: { name, price: price!, mrp, stockQuantity, stockStatus: stockStatusFor(stockQuantity, lowStock), brandId, categoryId, description: row["description"] ?? null, ...bulkFields },
          });
          updated++;
        } else {
          await prisma.product.create({
            data: {
              name, sku, price: price!,
              mrp,
              stockQuantity,
              stockStatus: stockStatusFor(stockQuantity, lowStock),
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
        errors.push(`Row ${rowNo}: ${e?.code === "P2002" ? "duplicate slug/sku" : "could not be saved"}`);
      }
    }
    await logActivity(req, "product.import", "product");
    cacheBustAll();
    return res.json({ success: true, data: { created, updated, failed, errors: errors.slice(0, 20) } });
  }
);

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const slugSchema = z.string().trim().max(120).regex(/^[a-z0-9-]*$/, "Slug may contain lowercase letters, digits and dashes");
const categorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema.optional(),
  description: z.string().max(2000).optional(),
  parentId: z.string().uuid().nullable().optional(),
  imageUrl: z.string().url().max(1000).optional().or(z.literal("")),
  displayOrder: z.number().int().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const getCategories = defineRoute(
  adminRequired,
  async (_req, res) => {
    const categories = await prisma.category.findMany({
      include: { _count: { select: { products: true } }, children: { include: { _count: { select: { products: true } } } } },
      orderBy: { displayOrder: "asc" },
    });
    return res.json({ success: true, data: categories });
  }
);

export const postCategories = defineRoute(
  adminRequired,
  can("products.edit"),
  validate(categorySchema),
  async (req, res) => {
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
    return res.json({ success: true, data: category });
  }
);

export const putCategoriesId = defineRoute(
  adminRequired,
  can("products.edit"),
  validate(categorySchema.partial()),
  async (req, res) => {
    if (req.body.parentId && req.body.parentId === req.params.id) throw BadRequest("A category cannot be its own parent");
    const category = await prisma.category.update({ where: { id: req.params.id }, data: req.body });
    await logActivity(req, "category.update", "category", category.id);
    cacheBustAll();
    return res.json({ success: true, data: category });
  }
);

export const deleteCategoriesId = defineRoute(
  adminRequired,
  can("products.edit"),
  async (req, res) => {
    await prisma.category.delete({ where: { id: req.params.id } });
    await logActivity(req, "category.delete", "category", req.params.id);
    cacheBustAll();
    return res.json({ success: true, data: { message: "Category deleted" } });
  }
);

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

const brandSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema.optional(),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().max(1000).optional().or(z.literal("")),
  website: z.string().url().max(1000).optional().or(z.literal("")),
  displayOrder: z.number().int().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const getBrands = defineRoute(
  adminRequired,
  async (_req, res) => {
    const brands = await prisma.brand.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { displayOrder: "asc" },
    });
    return res.json({ success: true, data: brands });
  }
);

export const postBrands = defineRoute(
  adminRequired,
  can("products.edit"),
  validate(brandSchema),
  async (req, res) => {
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
    return res.json({ success: true, data: brand });
  }
);

export const putBrandsId = defineRoute(
  adminRequired,
  can("products.edit"),
  validate(brandSchema.partial()),
  async (req, res) => {
    const brand = await prisma.brand.update({ where: { id: req.params.id }, data: req.body });
    await logActivity(req, "brand.update", "brand", brand.id);
    cacheBustAll();
    return res.json({ success: true, data: brand });
  }
);

export const deleteBrandsId = defineRoute(
  adminRequired,
  can("products.edit"),
  async (req, res) => {
    await prisma.brand.delete({ where: { id: req.params.id } });
    await logActivity(req, "brand.delete", "brand", req.params.id);
    cacheBustAll();
    return res.json({ success: true, data: { message: "Brand deleted" } });
  }
);

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

// GET /api/admin/inventory
export const getInventory = defineRoute(
  adminRequired,
  async (req, res) => {
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
    return res.json({
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
  }
);

// PUT /api/admin/inventory/update - batch stock adjustment
export const putInventoryUpdate = defineRoute(
  adminRequired,
  can("inventory.update"),
  validate(
    z.object({
      items: z
        .array(
          z.object({
            productId: z.string().uuid(),
            quantity: z.number().int().min(0).max(10_000_000),
            type: z.enum(["stock_in", "stock_out", "adjustment"]),
            reason: z.string().max(500).optional(),
          })
        )
        .min(1)
        .max(500),
    })
  ),
  async (req, res) => {
    const userId = req.user!.id;
    const lowStock = await lowStockThreshold();
    const results = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const item of req.body.items) {
        // Row lock: concurrent checkouts / adjustments on this product wait for us,
        // so the "set to N" adjustment and the logged delta are exact.
        const locked = await tx.$queryRaw<{ stockQuantity: number; name: string }[]>`SELECT "stockQuantity", name FROM "Product" WHERE id = ${item.productId} FOR UPDATE`;
        if (!locked.length) throw NotFound(`Product ${item.productId} not found`);
        const current = locked[0].stockQuantity;
        const delta = item.type === "stock_in" ? item.quantity : item.type === "stock_out" ? -item.quantity : item.quantity - current;
        const quantityAfter = current + delta;
        if (quantityAfter < 0) {
          // Previously clamped to 0 silently, which corrupted the audit trail.
          throw BadRequest(`Cannot remove ${item.quantity} of "${locked[0].name}": only ${current} in stock`, "INSUFFICIENT_STOCK");
        }
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: quantityAfter, stockStatus: stockStatusFor(quantityAfter, lowStock) },
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
    return res.json({ success: true, data: { results } });
  }
);

// GET /api/admin/inventory/history
export const getInventoryHistory = defineRoute(
  adminRequired,
  async (req, res) => {
    const productId = typeof req.query.productId === "string" && /^[0-9a-f-]{36}$/i.test(req.query.productId) ? req.query.productId : undefined;
    const logs = await prisma.inventoryLog.findMany({
      where: productId ? { productId } : {},
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return res.json({ success: true, data: logs });
  }
);
