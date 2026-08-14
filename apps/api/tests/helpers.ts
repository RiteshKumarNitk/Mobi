import request from "supertest";
import { expect } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

export const app = createApp();

let phoneSeq = 0;
// Timestamp + in-process sequence makes phones unique across runs and machines.
export const uniquePhone = () => `9${String(Date.now() % 100000000).padStart(8, "0")}${String(++phoneSeq % 10)}`;

export const ADMIN_PHONE = "9999999999";
export const ADMIN_PASSWORD = "Admin@123";

/** Register a fresh customer and verify their phone via the debug OTP. */
export async function registerCustomer(opts: { name?: string; shopName?: string } = {}) {
  const phone = uniquePhone();
  const password = "Test@12345";
  const reg = await request(app).post("/api/auth/register").send({
    phone,
    password,
    name: opts.name ?? "Test Shopkeeper",
    shopName: opts.shopName ?? "Test Electronics",
  });
  expect(reg.status).toBe(200);
  const code = reg.body.data?.debugCode;
  expect(code).toBeTruthy();
  const verify = await request(app).post("/api/otp/verify").send({ phone, purpose: "register", code });
  expect(verify.status).toBe(200);
  expect(verify.body.data.verified).toBe(true);
  return { phone, password, token: verify.body.data.accessToken as string, userId: verify.body.data.user.id as string };
}

export async function loginAdmin() {
  const res = await request(app).post("/api/auth/login").send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

/** Create a product (admin) and return its id + sku. */
export async function createProduct(token: string, overrides: Record<string, unknown> = {}) {
  const name = `TST Product ${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const res = await request(app)
    .post("/api/admin/products")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name,
      price: 100,
      stockQuantity: 50,
      ...overrides,
    });
  expect(res.status).toBe(200);
  const p = res.body.data;
  expect(p.sku).toBeTruthy();
  return { id: p.id, sku: p.sku, name: p.name, price: 100 };
}

/** Delete a product and any orders referencing it (test cleanup). */
export async function deleteProduct(id: string) {
  const product = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!product) return;
  await prisma.orderItem.deleteMany({ where: { productId: id } });
  await prisma.wishlistItem.deleteMany({ where: { productId: id } });
  await prisma.cartItem.deleteMany({ where: { productId: id } });
  await prisma.productImage.deleteMany({ where: { productId: id } });
  await prisma.productAttribute.deleteMany({ where: { productId: id } });
  await prisma.inventoryLog.deleteMany({ where: { productId: id } });
  await prisma.product.delete({ where: { id } });
}

export async function getProductId(nameContains: string) {
  const product = await prisma.product.findFirst({
    where: { name: { contains: nameContains, mode: "insensitive" }, status: "active" },
    select: { id: true },
  });
  return product?.id;
}

/** Add a shipping address for a customer; returns the address id. */
export async function addAddress(token: string) {
  const res = await request(app).post("/api/customers/addresses").set("Authorization", `Bearer ${token}`).send({
    fullName: "Test Shopkeeper",
    phone: "9999999999",
    addressLine1: "12 Test Street",
    city: "Delhi",
    state: "Delhi",
    pincode: "110001",
    addressType: "Shop",
  });
  expect(res.status).toBe(200);
  return res.body.data.id as string;
}

/** Create a percentage coupon (admin) for cart/order discount tests. */
export async function createCoupon(token: string, code: string, value = 10) {
  const res = await request(app).post("/api/admin/coupons").set("Authorization", `Bearer ${token}`).send({
    code,
    type: "percentage",
    value,
    minOrderAmount: 0,
    perUserLimit: 5,
    startDate: new Date(Date.now() - 86_400_000).toISOString(),
    endDate: new Date(Date.now() + 86_400_000 * 7).toISOString(),
    status: "active",
  });
  expect(res.status).toBe(200);
  return res.body.data.id as string;
}

/** Full order lifecycle helper: create a COD order for the customer. */
export async function createOrder(token: string, addressId: string, items: { productId: string; quantity: number }[]) {
  const res = await request(app)
    .post("/api/orders/create")
    .set("Authorization", `Bearer ${token}`)
    .send({ addressId, paymentMethod: "cod", items });
  expect(res.status).toBe(200);
  return res.body.data.order as { id: string; orderNumber: string; status: string; totalAmount: string };
}

/** Cleanup: remove every trace of a test user (orders first, then the user). */
export async function cleanupUser(userId: string) {
  await prisma.order.deleteMany({ where: { userId } });
  await prisma.cartItem.deleteMany({ where: { userId } });
  await prisma.cartSession.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

export async function cleanupDevice(deviceId: string) {
  await prisma.cartItem.deleteMany({ where: { deviceId } });
  await prisma.cartSession.deleteMany({ where: { deviceId } });
}
