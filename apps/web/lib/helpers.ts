import type { ApiRequest } from "./route";
import type { Prisma } from "@prisma/client";

export function paginate(query: ApiRequest["query"]) {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(String(query.pageSize ?? "20"), 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function genCode(prefix: string, len = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}${new Date().toISOString().slice(0, 10).replace(/-/g, "")}${s}`;
}

export const genOrderNumber = () => `BC-${genCode("")}`;
export const genReturnNumber = () => `RET-${genCode("")}`;
export const genSku = () => `SKU-${genCode("")}`;

export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Effective per-unit price for a quantity. When the product has a bulk (box)
 * price and the quantity reaches the box threshold, the box price applies.
 */
export function effectiveUnitPrice(p: { price: any; boxPrice: any; boxQuantity: any }, quantity: number): number {
  if (p.boxPrice != null && p.boxQuantity != null && quantity >= Number(p.boxQuantity)) {
    return Number(p.boxPrice);
  }
  return Number(p.price);
}

export function publicUser<T extends { passwordHash: string }>(u: T) {
  const { passwordHash: _ph, ...rest } = u;
  return rest;
}

/** Default include used for product listing/detail queries. */
export const productInclude = {
  images: { orderBy: { displayOrder: "asc" as const } },
  brand: true,
  category: true,
} satisfies Prisma.ProductInclude;

/** Compact product shape for cards / listing responses. */
export function productCard(p: any) {
  const sorted = p.images ? [...p.images].sort((a: any, b: any) => Number(b.isPrimary) - Number(a.isPrimary)) : [];
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    slug: p.slug,
    price: Number(p.price).toString(),
    mrp: p.mrp != null ? Number(p.mrp).toString() : null,
    boxPrice: p.boxPrice != null ? Number(p.boxPrice).toString() : null,
    boxQuantity: p.boxQuantity ?? null,
    hsnCode: p.hsnCode ?? null,
    stockQuantity: p.stockQuantity,
    stockStatus: p.stockStatus,
    isFeatured: p.isFeatured,
    isNew: p.isNew,
    isBestSeller: p.isBestSeller,
    image: sorted[0]?.url ?? null,
    brand: p.brand ? { id: p.brand.id, name: p.brand.name, slug: p.brand.slug } : null,
    category: p.category ? { id: p.category.id, name: p.category.name, slug: p.category.slug } : null,
  };
}
