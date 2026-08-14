import { prisma } from "./prisma";
import { round2 } from "./helpers";

export function couponDiscount(coupon: { type: string; value: { toString(): string }; maxDiscountAmount: { toString(): string } | null }, subtotal: number): number {
  let discount = coupon.type === "percentage" ? (subtotal * Number(coupon.value)) / 100 : Number(coupon.value);
  if (coupon.maxDiscountAmount && discount > Number(coupon.maxDiscountAmount)) {
    discount = Number(coupon.maxDiscountAmount);
  }
  if (discount > subtotal) discount = subtotal;
  return round2(discount);
}

export async function validateCoupon(
  coupon: any,
  userId: string | undefined,
  subtotal: number
): Promise<{ valid: boolean; message: string; discount: number }> {
  if (!coupon) return { valid: false, message: "Invalid coupon code", discount: 0 };
  if (coupon.status !== "active") return { valid: false, message: "This coupon is not active", discount: 0 };
  const now = new Date();
  if (coupon.startDate > now || coupon.endDate < now) {
    return { valid: false, message: "This coupon has expired", discount: 0 };
  }
  if (Number(coupon.minOrderAmount) > subtotal) {
    return { valid: false, message: `Minimum order amount of ₹${Number(coupon.minOrderAmount).toLocaleString("en-IN")} required`, discount: 0 };
  }
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    return { valid: false, message: "This coupon has reached its usage limit", discount: 0 };
  }
  if (userId) {
    const used = await prisma.couponUsage.count({ where: { couponId: coupon.id, userId } });
    if (used >= coupon.perUserLimit) return { valid: false, message: "You have already used this coupon", discount: 0 };
  }
  return { valid: true, message: "", discount: couponDiscount(coupon, subtotal) };
}

/** Full validation used at order creation, including product/category applicability. */
export async function validateCouponForOrder(
  coupon: any,
  userId: string,
  lines: { productId: string; quantity: number }[],
  byId: Map<string, { price: any; categoryId: string | null }>
) {
  const subtotal = lines.reduce((s, l) => s + Number(byId.get(l.productId)?.price ?? 0) * l.quantity, 0);
  const base = await validateCoupon(coupon, userId, subtotal);
  if (!base.valid) return base;
  if (coupon.applicableCategories?.length || coupon.applicableProducts?.length) {
    const catIds = new Set(coupon.applicableCategories.map((c: any) => c.id));
    const prodIds = new Set(coupon.applicableProducts.map((p: any) => p.id));
    const applies = lines.every((l) => {
      const p = byId.get(l.productId);
      return p && (prodIds.has(l.productId) || (p.categoryId && catIds.has(p.categoryId)));
    });
    if (!applies) return { valid: false, message: "This coupon does not apply to the products in your cart", discount: 0 };
  }
  return base;
}
