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

    const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
    if (payment) expect(payment.status).toBe("refunded");
  });
});
