import { prisma } from "./prisma";
import { getSettingsGroup } from "./settings";

export async function buildInvoice(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: { select: { hsnCode: true } } } }, shippingAddress: true, user: true, payments: true },
  });
  if (!order) return null;
  const general = await getSettingsGroup("general");
  const payment = order.payments[0];

  const taxableValue = Number(order.totalAmount) - Number(order.taxAmount);
  // Same-state assumption (seller in UP): split GST 50/50 into CGST + SGST.
  // Cross-state (IGST) would be the full amount — this is a display breakdown
  // of the tax already collected on the order (taxAmount).
  const gst = Number(order.taxAmount);
  const cgst = gst / 2;
  const sgst = gst / 2;

  return {
    invoiceNumber: `INV-${order.orderNumber}`,
    date: order.createdAt,
    company: {
      name: general.company_name ?? "Baba Communication",
      address: general.company_address ?? "",
      phone: general.company_phone ?? "",
      email: general.company_email ?? "",
      gst: general.gst_number ?? "",
    },
    customer: {
      name: (order.shippingAddress?.fullName ?? ([order.user?.firstName, order.user?.lastName].filter(Boolean).join(" ") || order.user?.phone)) || undefined,
      phone: order.shippingAddress?.phone ?? order.user?.phone,
      address: order.shippingAddress
        ? `${order.shippingAddress.addressLine1}${order.shippingAddress.addressLine2 ? ", " + order.shippingAddress.addressLine2 : ""}, ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`
        : "",
      gst: order.user?.gstNumber ?? "",
    },
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    gatewayPaymentId: payment?.gatewayPaymentId ?? null,
    items: order.items.map((i) => ({
      name: i.productName,
      sku: i.productSku,
      hsn: (i as any).product?.hsnCode ?? "8517",
      quantity: i.quantity,
      price: Number(i.price).toString(),
      total: Number(i.total).toString(),
    })),
    subtotal: Number(order.subtotal).toString(),
    discount: Number(order.discountAmount).toString(),
    shipping: Number(order.shippingCharge).toString(),
    tax: Number(order.taxAmount).toString(),
    taxableValue: taxableValue.toString(),
    cgst: cgst.toString(),
    sgst: sgst.toString(),
    total: Number(order.totalAmount).toString(),
    terms: "Goods once sold are not returnable unless defective. Warranty as per brand policy. Prices are exclusive of GST unless stated.",
  };
}
