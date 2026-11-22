-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "refundedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "gatewayOrderId" TEXT,
ADD COLUMN     "refundedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_eventId_key" ON "PaymentEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayOrderId_key" ON "Payment"("gatewayOrderId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");


-- Data-integrity guards (not expressible in the Prisma schema).
-- Stock can never go negative: a second line of defence behind the
-- conditional decrement in order creation (prevents overselling).
ALTER TABLE "Product" ADD CONSTRAINT "Product_stockQuantity_nonnegative" CHECK ("stockQuantity" >= 0);
-- Money columns can never go negative.
ALTER TABLE "Order" ADD CONSTRAINT "Order_amounts_nonnegative" CHECK ("totalAmount" >= 0 AND "subtotal" >= 0 AND "refundedAmount" >= 0 AND "refundedAmount" <= "totalAmount");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amounts_nonnegative" CHECK ("amount" >= 0 AND "refundedAmount" >= 0 AND "refundedAmount" <= "amount");
-- Coupon redemption counter can never exceed its limit.
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_usage_within_limit" CHECK ("usageLimit" IS NULL OR "usedCount" <= "usageLimit");
