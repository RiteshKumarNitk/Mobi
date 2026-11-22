import type { OrderStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { BadRequest } from "./errors";
import { returnStock, syncStockStatus } from "./stock";
import { lowStockThreshold } from "./settings";

export const CANCELLABLE: OrderStatus[] = ["pending", "processing"];

/**
 * Allowed admin status transitions. Anything not listed is rejected by the API.
 * Cancellation is only possible before packing; after shipping the path is
 * delivered → returned (handled through return requests).
 */
export const ORDER_FLOW: Record<OrderStatus, OrderStatus[]> = {
  pending: ["processing", "cancelled"],
  processing: ["packed", "cancelled"],
  packed: ["shipped"],
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};

type OrderLike = { id: string; status: OrderStatus; paymentStatus: string; paymentMethod: string | null; items: { productId: string | null; quantity: number }[] };

/**
 * Move an order to a new status. The status change is a conditional update on
 * the status we read, so two concurrent requests (double click, customer +
 * admin) cannot both apply it — and stock is restored at most once.
 */
export async function transitionOrder(
  order: OrderLike,
  next: OrderStatus,
  opts: { userId?: string; note?: string | null } = {}
): Promise<void> {
  if (!ORDER_FLOW[order.status]?.includes(next)) {
    throw BadRequest(`Cannot move order from "${order.status}" to "${next}"`, "INVALID_TRANSITION");
  }
  const lowStock = next === "cancelled" ? await lowStockThreshold() : 10;
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: next, ...(next === "delivered" ? { deliveredAt: new Date() } : {}) },
    });
    if (count !== 1) throw BadRequest("The order was updated by someone else. Refresh and try again.", "CONCURRENT_UPDATE");

    const paid = order.paymentStatus === "paid";
    let note = opts.note ?? null;

    if (next === "cancelled") {
      await returnStock(tx, order.items);
      await syncStockStatus(tx, order.items.map((i) => i.productId).filter(Boolean) as string[], lowStock);
      // An unpaid attempt simply fails. A paid order is NOT marked refunded here:
      // the refund has not happened yet. It is flagged for the team to process.
      await tx.payment.updateMany({ where: { orderId: order.id, status: "pending" }, data: { status: "failed", failureReason: "Order cancelled" } });
      if (paid) note = [note, "Paid order cancelled — REFUND REQUIRED"].filter(Boolean).join(" · ");
    }

    if (next === "delivered" && order.paymentMethod === "cod" && !paid) {
      // Cash collected on delivery. Online orders are only ever marked paid by a
      // verified gateway callback/webhook — never by a status change.
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "paid" } });
      await tx.payment.updateMany({ where: { orderId: order.id }, data: { status: "paid", completedAt: new Date() } });
    }

    await tx.orderStatusHistory.create({ data: { orderId: order.id, status: next, notes: note, updatedBy: opts.userId ?? null } });
  });
}

export async function cancelOrder(order: OrderLike, opts: { userId?: string; note?: string } = {}) {
  if (!CANCELLABLE.includes(order.status)) {
    throw BadRequest(`Order cannot be cancelled in "${order.status}" status`, "NOT_CANCELLABLE");
  }
  await transitionOrder(order, "cancelled", opts);
}
