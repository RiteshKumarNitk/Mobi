import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma";
import { addAddress, app, cleanupUser, createOrder, createProduct, deleteProduct, loginAdmin, registerCustomer } from "./helpers";

const productIds: string[] = [];
const userIds: string[] = [];

afterAll(async () => {
  for (const id of productIds) await deleteProduct(id).catch(() => {});
  for (const id of userIds) await cleanupUser(id).catch(() => {});
});

describe("returns & refunds", () => {
  it("rejects returns for non-delivered orders", async () => {
    const admin = await loginAdmin();
    const product = await createProduct(admin, { price: 100 });
    productIds.push(product.id);
    const customer = await registerCustomer();
    userIds.push(customer.userId);
    const addressId = await addAddress(customer.token);
    const order = await createOrder(customer.token, addressId, [{ productId: product.id, quantity: 1 }]);

    const orderItem = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    const res = await request(app)
      .post("/api/returns/create")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ orderId: order.id, reason: "Defective part", items: [{ orderItemId: orderItem!.id, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("delivered");
  });

  it("walks the return lifecycle: request -> approve -> refund -> processed", async () => {
    const admin = await loginAdmin();
    const product = await createProduct(admin, { price: 100 });
    productIds.push(product.id);
    const customer = await registerCustomer();
    userIds.push(customer.userId);
    const addressId = await addAddress(customer.token);
    const order = await createOrder(customer.token, addressId, [{ productId: product.id, quantity: 2 }]);

    // deliver the order so returns are allowed
    await request(app).put(`/api/admin/orders/${order.id}/status`).set("Authorization", `Bearer ${admin}`).send({ status: "processing" });
    await request(app).put(`/api/admin/orders/${order.id}/status`).set("Authorization", `Bearer ${admin}`).send({ status: "packed" });
    await request(app).put(`/api/admin/orders/${order.id}/status`).set("Authorization", `Bearer ${admin}`).send({ status: "shipped" });
    await request(app).put(`/api/admin/orders/${order.id}/status`).set("Authorization", `Bearer ${admin}`).send({ status: "delivered" });

    const orderItem = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    const created = await request(app)
      .post("/api/returns/create")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ orderId: order.id, reason: "Defective part", description: "Screen flickers", items: [{ orderItemId: orderItem!.id, quantity: 1 }] });
    expect(created.status).toBe(200);
    const returnId = created.body.data.returnId;
    expect(created.body.data.returnNumber).toMatch(/^RET-/);

    // a second request for the same order is rejected
    const dup = await request(app)
      .post("/api/returns/create")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ orderId: order.id, reason: "Defective part", items: [{ orderItemId: orderItem!.id, quantity: 1 }] });
    expect(dup.status).toBe(409);

    // admin approves
    const approved = await request(app)
      .put(`/api/admin/returns/${returnId}/status`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ status: "approved", adminNotes: "Approved after inspection" });
    expect(approved.status).toBe(200);

    // admin processes the refund
    const refund = await request(app)
      .post(`/api/admin/returns/${returnId}/refund`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ refundAmount: 100, notes: "Refunded via UPI" });
    expect(refund.status).toBe(200);
    expect(refund.body.data.status).toBe("processed");

    // ₹100 of a ₹200 COD order: a PARTIAL refund. The payment stays "paid" with the
    // refunded amount tracked; only a full refund flips it to "refunded".
    const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
    expect(payment!.status).toBe("paid");
    expect(Number(payment!.refundedAmount)).toBe(100);
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(Number(after!.refundedAmount)).toBe(100);
    expect(after!.paymentStatus).toBe("paid");

    // a processed return cannot be refunded again (no double refunds)
    const again = await request(app)
      .post(`/api/admin/returns/${returnId}/refund`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ refundAmount: 100 });
    expect(again.status).toBe(400);
  });

  it("validates return items against the order and caps refunds at the paid balance", async () => {
    const admin = await loginAdmin();
    const product = await createProduct(admin, { price: 100 });
    productIds.push(product.id);
    const customer = await registerCustomer();
    userIds.push(customer.userId);
    const other = await registerCustomer();
    userIds.push(other.userId);
    const addressId = await addAddress(customer.token);
    const otherAddress = await addAddress(other.token);
    const order = await createOrder(customer.token, addressId, [{ productId: product.id, quantity: 2 }]);
    const otherOrder = await createOrder(other.token, otherAddress, [{ productId: product.id, quantity: 1 }]);
    for (const status of ["processing", "packed", "shipped", "delivered"]) {
      await request(app).put(`/api/admin/orders/${order.id}/status`).set("Authorization", `Bearer ${admin}`).send({ status });
    }
    const item = await prisma.orderItem.findFirst({ where: { orderId: order.id } });
    const foreignItem = await prisma.orderItem.findFirst({ where: { orderId: otherOrder.id } });

    // an item from someone else's order is rejected
    const foreign = await request(app)
      .post("/api/returns/create")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ orderId: order.id, reason: "Defective part", items: [{ orderItemId: foreignItem!.id, quantity: 1 }] });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.code).toBe("RETURN_ITEM_INVALID");

    // more than was bought is rejected
    const tooMany = await request(app)
      .post("/api/returns/create")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ orderId: order.id, reason: "Defective part", items: [{ orderItemId: item!.id, quantity: 3 }] });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.code).toBe("RETURN_QTY_EXCEEDED");

    const created = await request(app)
      .post("/api/returns/create")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ orderId: order.id, reason: "Defective part", items: [{ orderItemId: item!.id, quantity: 2 }] });
    expect(created.status).toBe(200);
    const returnId = created.body.data.returnId;

    // refunding before approval is rejected
    const early = await request(app).post(`/api/admin/returns/${returnId}/refund`).set("Authorization", `Bearer ${admin}`).send({});
    expect(early.status).toBe(400);

    await request(app).put(`/api/admin/returns/${returnId}/status`).set("Authorization", `Bearer ${admin}`).send({ status: "approved" });

    // a refund above the order total is rejected
    const over = await request(app).post(`/api/admin/returns/${returnId}/refund`).set("Authorization", `Bearer ${admin}`).send({ refundAmount: 999999 });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe("REFUND_EXCEEDS_BALANCE");

    // default refund = value of returned items (2 x 100); a full refund marks the order refunded
    const full = await request(app).post(`/api/admin/returns/${returnId}/refund`).set("Authorization", `Bearer ${admin}`).send({});
    expect(full.status).toBe(200);
    expect(Number(full.body.data.refundAmount)).toBe(200);
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after!.paymentStatus).toBe("refunded");

    // illegal return transitions are rejected
    const back = await request(app).put(`/api/admin/returns/${returnId}/status`).set("Authorization", `Bearer ${admin}`).send({ status: "pending" });
    expect(back.status).toBe(400);
  });
});
