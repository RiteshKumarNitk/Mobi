import crypto from "crypto";
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma";
import { env } from "../src/lib/env";
import { paymentMode } from "../src/lib/razorpay";
import { addAddress, app, cleanupDevice, cleanupUser, createCoupon, createOrder, createProduct, deleteProduct, loginAdmin, registerCustomer } from "./helpers";

const productIds: string[] = [];
const userIds: string[] = [];
const couponIds: string[] = [];
const deviceIds: string[] = [];
const eventIds: string[] = [];

afterAll(async () => {
  for (const d of deviceIds) await cleanupDevice(d);
  for (const id of userIds) await cleanupUser(id).catch(() => {});
  await prisma.coupon.deleteMany({ where: { id: { in: couponIds } } }).catch(() => {});
  for (const id of productIds) await deleteProduct(id).catch(() => {});
  await prisma.paymentEvent.deleteMany({ where: { eventId: { in: eventIds } } });
});

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function setup(stock = 50, price = 100) {
  const admin = await loginAdmin();
  const product = await createProduct(admin, { price, stockQuantity: stock });
  productIds.push(product.id);
  const customer = await registerCustomer();
  userIds.push(customer.userId);
  const addressId = await addAddress(customer.token);
  return { admin, product, customer, addressId };
}

describe("cart -> checkout for signed-in customers", () => {
  it("checks out from the account cart (no explicit items) and clears it", async () => {
    const { product, customer, addressId } = await setup();
    const add = await request(app).post("/api/cart/add").set(auth(customer.token)).send({ productId: product.id, quantity: 3 });
    expect(add.status).toBe(200);

    const cart = await request(app).get("/api/cart").set(auth(customer.token));
    expect(cart.body.data.items).toHaveLength(1);
    expect(cart.body.data.summary.subtotal).toBe("300");

    const order = await request(app).post("/api/orders/create").set(auth(customer.token)).send({ addressId, paymentMethod: "cod" });
    expect(order.status).toBe(200);
    // the server-side total is what the cart showed
    expect(Number(order.body.data.order.totalAmount)).toBe(Number(cart.body.data.summary.total));

    const after = await request(app).get("/api/cart").set(auth(customer.token));
    expect(after.body.data.items).toHaveLength(0);
  });

  it("merges a guest (device) cart into the account cart on login", async () => {
    const { product, customer, addressId } = await setup();
    const deviceId = `tst-device-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    deviceIds.push(deviceId);
    await request(app).post("/api/cart/add").set("x-device-id", deviceId).send({ productId: product.id, quantity: 2 });

    const merged = await request(app).get("/api/cart").set(auth(customer.token)).set("x-device-id", deviceId);
    expect(merged.status).toBe(200);
    expect(merged.body.data.items).toHaveLength(1);
    expect(merged.body.data.items[0].quantity).toBe(2);
    expect(await prisma.cartItem.count({ where: { deviceId } })).toBe(0);

    const order = await request(app).post("/api/orders/create").set(auth(customer.token)).send({ addressId, paymentMethod: "cod" });
    expect(order.status).toBe(200);
  });

  it("merges correctly when several cart requests arrive at once right after login", async () => {
    const { product, customer } = await setup();
    const deviceId = `tst-device-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    deviceIds.push(deviceId);
    await request(app).post("/api/cart/add").set("x-device-id", deviceId).send({ productId: product.id, quantity: 2 });
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => request(app).get("/api/cart").set(auth(customer.token)).set("x-device-id", deviceId))
    );
    for (const r of results) expect(r.status).toBe(200);
    const cart = await request(app).get("/api/cart").set(auth(customer.token));
    expect(cart.body.data.items).toHaveLength(1);
    expect(cart.body.data.items[0].quantity).toBe(2); // neither lost nor double-counted
    expect(cart.headers["cache-control"]).toBe("no-store");
  });

  it("rejects an expired/invalid token on the cart instead of silently using a guest cart", async () => {
    const res = await request(app).get("/api/cart").set("Authorization", "Bearer not-a-token");
    expect(res.status).toBe(401);
  });
});

describe("concurrency & data integrity", () => {
  it("never oversells under concurrent checkouts", async () => {
    const { product, customer, addressId } = await setup(2);
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).post("/api/orders/create").set(auth(customer.token)).send({ addressId, paymentMethod: "cod", items: [{ productId: product.id, quantity: 1 }] })
      )
    );
    const ok = attempts.filter((r) => r.status === 200).length;
    expect(ok).toBe(2);
    for (const r of attempts.filter((x) => x.status !== 200)) expect(r.body.error.code).toBe("OUT_OF_STOCK");
    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p!.stockQuantity).toBe(0);
    expect(p!.stockStatus).toBe("out_of_stock");
  });

  it("restores stock exactly once when a cancel is double-submitted", async () => {
    const { product, customer, addressId } = await setup(10);
    const order = await createOrder(customer.token, addressId, [{ productId: product.id, quantity: 4 }]);
    const [a, b] = await Promise.all([
      request(app).post(`/api/orders/${order.id}/cancel`).set(auth(customer.token)),
      request(app).post(`/api/orders/${order.id}/cancel`).set(auth(customer.token)),
    ]);
    expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p!.stockQuantity).toBe(10);
  });

  it("enforces a coupon's global usage limit under concurrent redemption", async () => {
    const { admin, product, customer, addressId } = await setup(20);
    const code = `TSTLIM${Date.now().toString().slice(-6)}`;
    const couponId = await createCoupon(admin, code, 10);
    couponIds.push(couponId);
    await prisma.coupon.update({ where: { id: couponId }, data: { usageLimit: 1 } });
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        request(app).post("/api/orders/create").set(auth(customer.token)).send({ addressId, paymentMethod: "cod", couponCode: code, items: [{ productId: product.id, quantity: 1 }] })
      )
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const c = await prisma.coupon.findUnique({ where: { id: couponId } });
    expect(c!.usedCount).toBe(1);
  });

  it("rejects stock-out adjustments larger than the stock instead of clamping", async () => {
    const { admin, product } = await setup(5);
    const res = await request(app)
      .put("/api/admin/inventory/update")
      .set(auth(admin))
      .send({ items: [{ productId: product.id, quantity: 9, type: "stock_out", reason: "test" }] });
    expect(res.status).toBe(400);
    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p!.stockQuantity).toBe(5);
  });
});

describe("online payments (mock gateway in test)", () => {
  it("runs in mock mode only outside production", () => {
    expect(env.isProd).toBe(false);
    expect(paymentMode()).toBe("mock");
  });

  it("binds verification to the gateway order created for THIS order and is idempotent", async () => {
    const { product, customer, addressId } = await setup();
    const make = () =>
      request(app).post("/api/orders/create").set(auth(customer.token)).send({ addressId, paymentMethod: "razorpay", items: [{ productId: product.id, quantity: 1 }] });
    const o1 = await make();
    const o2 = await make();
    expect(o1.status).toBe(200);
    expect(o1.body.data.mockPayment).toBe(true);
    const rzp1 = o1.body.data.razorpayOrder.id;
    const rzp2 = o2.body.data.razorpayOrder.id;

    // a (valid) payment for order 2 cannot be replayed to pay order 1
    const swapped = await request(app)
      .post("/api/payments/verify")
      .set(auth(customer.token))
      .send({ orderId: o1.body.data.order.id, razorpayOrderId: rzp2, razorpayPaymentId: "pay_mock_x", razorpaySignature: "sig" });
    expect(swapped.status).toBe(400);
    expect(swapped.body.error.code).toBe("PAYMENT_ORDER_MISMATCH");

    const ok = await request(app)
      .post("/api/payments/verify")
      .set(auth(customer.token))
      .send({ orderId: o1.body.data.order.id, razorpayOrderId: rzp1, razorpayPaymentId: `pay_mock_${Date.now()}`, razorpaySignature: "sig" });
    expect(ok.status).toBe(200);
    const again = await request(app)
      .post("/api/payments/verify")
      .set(auth(customer.token))
      .send({ orderId: o1.body.data.order.id, razorpayOrderId: rzp1, razorpayPaymentId: `pay_mock_${Date.now()}`, razorpaySignature: "sig" });
    expect(again.status).toBe(200);
    expect(again.body.data.message).toMatch(/already/i);

    const paid = await prisma.order.findUnique({ where: { id: o1.body.data.order.id } });
    expect(paid!.paymentStatus).toBe("paid");
  });

  it("never marks an unpaid online order paid on delivery", async () => {
    const { admin, product, customer, addressId } = await setup();
    const o = await request(app).post("/api/orders/create").set(auth(customer.token)).send({ addressId, paymentMethod: "razorpay", items: [{ productId: product.id, quantity: 1 }] });
    const id = o.body.data.order.id;
    for (const status of ["processing", "packed", "shipped", "delivered"]) {
      const r = await request(app).put(`/api/admin/orders/${id}/status`).set(auth(admin)).send({ status });
      expect(r.status).toBe(200);
    }
    const order = await prisma.order.findUnique({ where: { id } });
    expect(order!.paymentStatus).toBe("pending");
  });

  it("refuses online checkout when payments are disabled (production without keys)", async () => {
    const { product, customer, addressId } = await setup();
    const saved = env.allowMockPayments;
    (env as any).allowMockPayments = false;
    try {
      expect(paymentMode()).toBe("disabled");
      const res = await request(app).post("/api/orders/create").set(auth(customer.token)).send({ addressId, paymentMethod: "razorpay", items: [{ productId: product.id, quantity: 1 }] });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("PAYMENTS_DISABLED");
      const cfg = await request(app).get("/api/payments/config");
      expect(cfg.body.data.onlineEnabled).toBe(false);
    } finally {
      (env as any).allowMockPayments = saved;
    }
  });

  it("processes signed webhooks once, rejects bad signatures and wrong amounts", async () => {
    const { product, customer, addressId } = await setup(50, 250);
    const o = await request(app).post("/api/orders/create").set(auth(customer.token)).send({ addressId, paymentMethod: "razorpay", items: [{ productId: product.id, quantity: 1 }] });
    const gatewayOrderId = o.body.data.razorpayOrder.id;
    const orderId = o.body.data.order.id;
    const amount = Math.round(Number(o.body.data.order.totalAmount) * 100);

    const saved = env.razorpayWebhookSecret;
    (env as any).razorpayWebhookSecret = "whsec_test_secret";
    try {
      const send = (body: object, eventId: string, secret = "whsec_test_secret") => {
        eventIds.push(eventId);
        const raw = JSON.stringify(body);
        const sig = crypto.createHmac("sha256", secret).update(raw).digest("hex");
        return request(app)
          .post("/api/payments/razorpay/webhook")
          .set("Content-Type", "application/json")
          .set("x-razorpay-signature", sig)
          .set("x-razorpay-event-id", eventId)
          .send(raw);
      };
      const event = (amt: number, pid: string) => ({ event: "payment.captured", payload: { payment: { entity: { id: pid, order_id: gatewayOrderId, amount: amt, status: "captured" } } } });

      const forged = await send(event(amount, "pay_forged"), `evt_forged_${Date.now()}`, "wrong-secret");
      expect(forged.status).toBe(401);

      const wrongAmount = await send(event(100, "pay_cheap"), `evt_cheap_${Date.now()}`);
      expect(wrongAmount.status).toBe(200);
      expect(wrongAmount.body.data.processed).toBe(false);
      expect((await prisma.order.findUnique({ where: { id: orderId } }))!.paymentStatus).toBe("pending");

      const evt = `evt_ok_${Date.now()}`;
      const okRes = await send(event(amount, `pay_wh_${Date.now()}`), evt);
      expect(okRes.status).toBe(200);
      expect((await prisma.order.findUnique({ where: { id: orderId } }))!.paymentStatus).toBe("paid");

      const dup = await send(event(amount, "pay_dup"), evt);
      expect(dup.body.data.duplicate).toBe(true);
    } finally {
      (env as any).razorpayWebhookSecret = saved;
    }
  });
});
