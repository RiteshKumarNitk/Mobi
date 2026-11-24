import type { Prisma } from "@prisma/client";
import { BadRequest } from "./errors";

type Tx = Prisma.TransactionClient;

export const DEFAULT_LOW_STOCK = 10;

export const stockStatusFor = (qty: number, lowStock = DEFAULT_LOW_STOCK) =>
  (qty > lowStock ? "in_stock" : qty > 0 ? "low_stock" : "out_of_stock") as "in_stock" | "low_stock" | "out_of_stock";

/**
 * Atomically take stock for order lines. Each decrement is conditional on
 * enough stock being available *at write time* (`stockQuantity >= qty`), so
 * concurrent checkouts can never oversell: the loser's update matches no row
 * and the whole transaction rolls back. A DB CHECK constraint
 * (stockQuantity >= 0) backs this up.
 */
export async function takeStock(tx: Tx, lines: { productId: string; quantity: number }[], names: Map<string, string>) {
  // Merge duplicate lines for the same product so the check covers the total.
  const totals = new Map<string, number>();
  for (const l of lines) totals.set(l.productId, (totals.get(l.productId) ?? 0) + l.quantity);
  // Lock rows in a stable order to avoid deadlocks between concurrent orders.
  for (const [productId, quantity] of [...totals.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const { count } = await tx.product.updateMany({
      where: { id: productId, status: "active", stockQuantity: { gte: quantity } },
      data: { stockQuantity: { decrement: quantity } },
    });
    if (count !== 1) {
      const current = await tx.product.findUnique({ where: { id: productId }, select: { stockQuantity: true } });
      throw BadRequest(
        `Insufficient stock for "${names.get(productId) ?? "a product"}". Only ${Math.max(0, current?.stockQuantity ?? 0)} left.`,
        "OUT_OF_STOCK"
      );
    }
  }
}

/** Return stock for cancelled orders. */
export async function returnStock(tx: Tx, items: { productId: string | null; quantity: number }[]) {
  for (const item of items) {
    if (!item.productId) continue;
    // updateMany: a product deleted since the order was placed is skipped, not an error.
    await tx.product.updateMany({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity } } });
  }
}

/** Recompute stockStatus for the given products from their current quantities. */
export async function syncStockStatus(tx: Tx, productIds: string[], lowStock = DEFAULT_LOW_STOCK) {
  const ids = [...new Set(productIds)];
  if (!ids.length) return;
  await tx.product.updateMany({ where: { id: { in: ids }, stockQuantity: { lte: 0 } }, data: { stockStatus: "out_of_stock" } });
  await tx.product.updateMany({ where: { id: { in: ids }, stockQuantity: { gt: 0, lte: lowStock } }, data: { stockStatus: "low_stock" } });
  await tx.product.updateMany({ where: { id: { in: ids }, stockQuantity: { gt: lowStock } }, data: { stockStatus: "in_stock" } });
}
