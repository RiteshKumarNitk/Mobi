import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma";
import { app, cleanupDevice, createCoupon, createProduct, deleteProduct, loginAdmin } from "./helpers";

const productIds: string[] = [];
const couponIds: string[] = [];
const deviceIds: string[] = [];

const freshDevice = () => {
  const d = `tst-device-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  deviceIds.push(d);
  return d;
};

afterAll(async () => {
  for (const d of deviceIds) await cleanupDevice(d);
  await prisma.coupon.deleteMany({ where: { id: { in: couponIds } } }).catch(() => {});
  for (const id of productIds) await deleteProduct(id).catch(() => {});
});

describe("cart & bulk pricing", () => {
  it("applies box pricing when quantity crosses the threshold", async () => {
    const admin = await loginAdmin();
    const product = await createProduct(admin, { price: 100, boxPrice: 80, boxQuantity: 5 });
    productIds.push(product.id);
    const deviceId = freshDevice();

    // Single unit -> full price
    let res = await request(app).post("/api/cart/add").set("x-device-id", deviceId).send({ productId: product.id, quantity: 1 });
    expect(res.status).toBe(200);

    let cart = await request(app).get("/api/cart").set("x-device-id", deviceId);
    expect(cart.body.data.items[0].unitPrice).toBe("100");
    expect(cart.body.data.items[0].bulkApplied).toBe(false);
    expect(cart.body.data.summary.subtotal).toBe("100");

    // Bump to 5 -> box price kicks in
    const itemId = cart.body.data.items[0].id;
    res = await request(app).put("/api/cart/update").set("x-device-id", deviceId).send({ itemId, quantity: 5 });
    expect(res.status).toBe(200);

    cart = await request(app).get("/api/cart").set("x-device-id", deviceId);
    expect(cart.body.data.items[0].unitPrice).toBe("80");
    expect(cart.body.data.items[0].bulkApplied).toBe(true);
    expect(cart.body.data.summary.subtotal).toBe("400");
  });

  it("quick-adds by SKU and flags unknown SKUs", async () => {
    const admin = await loginAdmin();
    const product = await createProduct(admin, { price: 50 });
    productIds.push(product.id);
    const deviceId = freshDevice();

    const res = await request(app)
      .post("/api/cart/quick-add")
      .set("x-device-id", deviceId)
      .send({ lines: [{ sku: product.sku, quantity: 3 }, { sku: "DOES-NOT-EXIST-999", quantity: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.data.added).toBe(3);
    const bad = res.body.data.results.find((r: any) => r.sku === "DOES-NOT-EXIST-999");
    expect(bad.found).toBe(false);

    const cart = await request(app).get("/api/cart").set("x-device-id", deviceId);
    const line = cart.body.data.items.find((i: any) => i.product.sku === product.sku);
    expect(line.quantity).toBe(3);
  });

  it("applies and removes a coupon on the summary", async () => {
    const admin = await loginAdmin();
    const product = await createProduct(admin, { price: 100, boxPrice: 80, boxQuantity: 5 });
    productIds.push(product.id);
    const couponId = await createCoupon(admin, `TST${Date.now() % 100000}`);
    couponIds.push(couponId);
    const deviceId = freshDevice();

    await request(app).post("/api/cart/add").set("x-device-id", deviceId).send({ productId: product.id, quantity: 5 });
    const coupons = await request(app).get("/api/admin/coupons").set("Authorization", `Bearer ${admin}`);
    const code = coupons.body.data.items.find((c: any) => c.id === couponId).code;

    const applied = await request(app).post("/api/cart/apply-coupon").set("x-device-id", deviceId).send({ code });
    expect(applied.status).toBe(200);
    expect(applied.body.data.message).toContain("applied");

    const cart = await request(app).get("/api/cart").set("x-device-id", deviceId);
    // 10% of 400 = 40
    expect(cart.body.data.summary.discount).toBe("40");
    expect(cart.body.data.summary.total).toBe("360");

    await request(app).delete("/api/cart/remove-coupon").set("x-device-id", deviceId);
    const after = await request(app).get("/api/cart").set("x-device-id", deviceId);
    expect(after.body.data.summary.discount).toBe("0");
    expect(after.body.data.summary.total).toBe("400");
  });
});
