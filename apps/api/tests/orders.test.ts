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

describe("orders", () => {
  it("applies box pricing at order creation", async () => {
    const admin = await loginAdmin();
    const product = await createProduct(admin, { price: 100, boxPrice: 80, boxQuantity: 5 });
    productIds.push(product.id);
    const customer = await registerCustomer();
    userIds.push(customer.userId);
    const addressId = await addAddress(customer.token);

    const order = await createOrder(customer.token, addressId, [{ productId: product.id, quantity: 5 }]);
    expect(order.status).toBe("pending");
    expect(Number(order.totalAmount)).toBe(400);

    const db = await prisma.order.findUnique({ where: { id: order.id }, include: { items: true } });
    expect(db?.items[0].price.toString()).toBe("80");
  });

  it("rejects orders that exceed stock", async () => {
    const admin = await loginAdmin();
    const product = await createProduct(admin, { price: 10, stockQuantity: 2 });
    productIds.push(product.id);
    const customer = await registerCustomer();
    userIds.push(customer.userId);
    const addressId = await addAddress(customer.token);

    const res = await request(app)
      .post("/api/orders/create")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ addressId, paymentMethod: "cod", items: [{ productId: product.id, quantity: 99 }] });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("Insufficient stock");
  });

  it("produces a GST invoice with HSN codes and tax breakup", async () => {
    const admin = await loginAdmin();
    const product = await createProduct(admin, { price: 100, hsnCode: "8507" });
    productIds.push(product.id);
    const customer = await registerCustomer();
    userIds.push(customer.userId);
    const addressId = await addAddress(customer.token);

    const order = await createOrder(customer.token, addressId, [{ productId: product.id, quantity: 2 }]);

    const invoice = await request(app).get(`/api/orders/${order.id}/invoice`).set("Authorization", `Bearer ${customer.token}`);
    expect(invoice.status).toBe(200);
    expect(invoice.body.data.invoiceNumber).toMatch(/^INV-/);
    expect(invoice.body.data.items[0].hsn).toBe("8507");
    expect(invoice.body.data.company.gst).toBeTruthy();
    expect(invoice.body.data.customer.gst).toBe(""); // test customer has no GST yet
    expect(Number(invoice.body.data.taxableValue)).toBeGreaterThan(0);

    // guest tracking works without auth
    const track = await request(app).get(`/api/orders/track/${order.orderNumber}`);
    expect(track.status).toBe(200);
    expect(track.body.data.orderNumber).toBe(order.orderNumber);
  });

  it("enforces the order status state machine", async () => {
    const admin = await loginAdmin();
    const product = await createProduct(admin, { price: 50 });
    productIds.push(product.id);
    const customer = await registerCustomer();
    userIds.push(customer.userId);
    const addressId = await addAddress(customer.token);
    const order = await createOrder(customer.token, addressId, [{ productId: product.id, quantity: 1 }]);

    const setStatus = (status: string) =>
      request(app).put(`/api/admin/orders/${order.id}/status`).set("Authorization", `Bearer ${admin}`).send({ status });

    // pending -> delivered is not a legal jump
    const bad = await setStatus("delivered");
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain("Cannot move order");

    // walk the legal path
    expect((await setStatus("processing")).status).toBe(200);
    expect((await setStatus("shipped")).status).toBe(400); // processing -> shipped illegal
    expect((await setStatus("packed")).status).toBe(200);
    expect((await setStatus("shipped")).status).toBe(200);
    expect((await setStatus("delivered")).status).toBe(200);

    const fresh = await request(app).get(`/api/orders/${order.id}/status`).set("Authorization", `Bearer ${customer.token}`);
    expect(fresh.body.data.status).toBe("delivered");

    // delivered is terminal for further transitions
    const terminal = await setStatus("cancelled");
    expect(terminal.status).toBe(400);

    // COD order marked delivered flips payment to paid
    const db = await prisma.order.findUnique({ where: { id: order.id } });
    expect(db?.paymentStatus).toBe("paid");
  });
});
