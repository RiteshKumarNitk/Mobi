import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma";
import { env, productionConfigErrors } from "../src/lib/env";
import { hashPassword } from "../src/lib/passwords";
import { app, cleanupUser, loginAdmin, registerCustomer, uniquePhone } from "./helpers";

const userIds: string[] = [];
const pageSlugs: string[] = [];

afterAll(async () => {
  for (const id of userIds) await cleanupUser(id).catch(() => {});
  if (pageSlugs.length) await prisma.page.deleteMany({ where: { slug: { in: pageSlugs } } });
});

async function createStaff(role: "staff" | "manager" = "staff") {
  const phone = uniquePhone();
  const password = "Staff@12345";
  const user = await prisma.user.create({
    data: { phone, passwordHash: await hashPassword(password), firstName: "Test", lastName: role, role, status: "active", phoneVerified: true },
  });
  userIds.push(user.id);
  const res = await request(app).post("/api/auth/login").send({ phone, password });
  expect(res.status).toBe(200);
  return { id: user.id, token: res.body.data.accessToken as string };
}

describe("account status & tokens", () => {
  it("a deactivated customer loses access immediately and cannot re-activate via OTP", async () => {
    const admin = await loginAdmin();
    const c = await registerCustomer();
    userIds.push(c.userId);

    const login = await request(app).post("/api/auth/login").send({ phone: c.phone, password: c.password });
    const refreshToken = login.body.data.refreshToken;

    const deact = await request(app).delete(`/api/admin/customers/${c.userId}`).set("Authorization", `Bearer ${admin}`);
    expect(deact.status).toBe(200);

    // existing access token is rejected right away (not at JWT expiry)
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${c.token}`);
    expect(me.status).toBe(401);
    // refresh tokens were revoked
    const refreshed = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(refreshed.status).toBe(401);
    // no OTP is sent to a deactivated account, and an OTP login cannot re-activate it
    const send = await request(app).post("/api/otp/send").send({ phone: c.phone, purpose: "login" });
    expect(send.body.data.debugCode).toBeNull();
    const verify = await request(app).post("/api/otp/verify").send({ phone: c.phone, purpose: "register", code: "123456" });
    expect(verify.status).toBeGreaterThanOrEqual(400);
    const user = await prisma.user.findUnique({ where: { id: c.userId } });
    expect(user!.status).toBe("inactive");
  });

  it("a refresh token cannot be used as an access token", async () => {
    const c = await registerCustomer();
    userIds.push(c.userId);
    const login = await request(app).post("/api/auth/login").send({ phone: c.phone, password: c.password });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${login.body.data.refreshToken}`);
    expect(res.status).toBe(401);
  });

  it("rotates refresh tokens and revokes every session when a used token is replayed", async () => {
    const c = await registerCustomer();
    userIds.push(c.userId);
    const login = await request(app).post("/api/auth/login").send({ phone: c.phone, password: c.password });
    const first = login.body.data.refreshToken;

    const r1 = await request(app).post("/api/auth/refresh").send({ refreshToken: first });
    expect(r1.status).toBe(200);
    const second = r1.body.data.refreshToken;
    expect(second).not.toBe(first);

    // replaying the consumed token = theft signal
    const replay = await request(app).post("/api/auth/refresh").send({ refreshToken: first });
    expect(replay.status).toBe(401);
    // ...which also kills the legitimately rotated token
    const r2 = await request(app).post("/api/auth/refresh").send({ refreshToken: second });
    expect(r2.status).toBe(401);
  });

  it("enforces the password policy and supports change-password", async () => {
    const weak = await request(app).post("/api/auth/register").send({ phone: uniquePhone(), password: "abc12", name: "Weak Pw" });
    expect(weak.status).toBe(400);

    const c = await registerCustomer();
    userIds.push(c.userId);
    const wrong = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${c.token}`)
      .send({ currentPassword: "nope", newPassword: "NewPass1234" });
    expect(wrong.status).toBe(400);
    const ok = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${c.token}`)
      .send({ currentPassword: c.password, newPassword: "NewPass1234" });
    expect(ok.status).toBe(200);
    const relog = await request(app).post("/api/auth/login").send({ phone: c.phone, password: "NewPass1234" });
    expect(relog.status).toBe(200);
  });

  it("forgot-password does not reveal whether a number is registered", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({ phone: uniquePhone() });
    expect(res.status).toBe(200);
    expect(res.body.data.otpSent).toBe(true);
    expect(res.body.data.debugCode).toBeNull();
  });

  it("an unverified registration can be re-claimed by the real owner (no number squatting)", async () => {
    const phone = uniquePhone();
    const squat = await request(app).post("/api/auth/register").send({ phone, password: "Squat12345", name: "Squatter" });
    expect(squat.status).toBe(200);
    const owner = await request(app).post("/api/auth/register").send({ phone, password: "Owner12345", name: "Real Owner" });
    expect(owner.status).toBe(200);
    const verify = await request(app).post("/api/otp/verify").send({ phone, purpose: "register", code: owner.body.data.debugCode });
    expect(verify.status).toBe(200);
    userIds.push(verify.body.data.user.id);
    expect(verify.body.data.user.firstName).toBe("Real");
    const login = await request(app).post("/api/auth/login").send({ phone, password: "Owner12345" });
    expect(login.status).toBe(200);
  });
});

describe("admin authorization", () => {
  it("staff can view but not edit customers, and cannot reach settings, logs or backups", async () => {
    const staff = await createStaff("staff");
    const c = await registerCustomer();
    userIds.push(c.userId);
    const auth = { Authorization: `Bearer ${staff.token}` };

    expect((await request(app).get("/api/admin/customers").set(auth)).status).toBe(200);
    expect((await request(app).put(`/api/admin/customers/${c.userId}`).set(auth).send({ status: "inactive" })).status).toBe(403);
    expect((await request(app).delete(`/api/admin/customers/${c.userId}`).set(auth)).status).toBe(403);
    expect((await request(app).get("/api/admin/settings").set(auth)).status).toBe(403);
    expect((await request(app).get("/api/admin/logs").set(auth)).status).toBe(403);
    expect((await request(app).get("/api/admin/backups").set(auth)).status).toBe(403);
    expect((await request(app).post("/api/admin/backups").set(auth)).status).toBe(403);
  });

  it("the customers API can never modify an admin account", async () => {
    const admin = await loginAdmin();
    const staff = await createStaff("manager");
    const res = await request(app).put(`/api/admin/customers/${staff.id}`).set("Authorization", `Bearer ${admin}`).send({ status: "inactive" });
    expect(res.status).toBe(404);
    const u = await prisma.user.findUnique({ where: { id: staff.id } });
    expect(u!.status).toBe("active");
  });

  it("rejects backup ids that try to escape the backup directory", async () => {
    const admin = await loginAdmin();
    for (const id of ["..%2F..%2Fpackage", "..%2F..%2F..%2Fpackage", "backup-..%2F..%2Fx"]) {
      const res = await request(app).get(`/api/admin/backups/${id}/download`).set("Authorization", `Bearer ${admin}`);
      expect(res.status).toBe(404);
    }
  });

  it("validates numeric settings that feed checkout totals", async () => {
    const admin = await loginAdmin();
    const res = await request(app)
      .put("/api/admin/settings/shipping")
      .set("Authorization", `Bearer ${admin}`)
      .send({ values: { shipping_flat_rate: "abc" } });
    expect(res.status).toBe(400);
  });

  it("rejects javascript: banner links", async () => {
    const admin = await loginAdmin();
    const res = await request(app)
      .post("/api/admin/banners")
      .set("Authorization", `Bearer ${admin}`)
      .send({ type: "homepage", imageUrl: "https://example.com/a.png", linkUrl: "javascript:alert(1)" });
    expect(res.status).toBe(400);
  });

  it("sanitizes CMS HTML so scripts never reach the storefront", async () => {
    const admin = await loginAdmin();
    const slug = `tst-page-${Date.now()}`;
    pageSlugs.push(slug);
    const put = await request(app)
      .put(`/api/admin/pages/${slug}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ title: "Test page", status: "published", content: '<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:alert(2)">x</a>' });
    expect(put.status).toBe(200);
    const pub = await request(app).get(`/api/pages/${slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.content).toContain("<p>Hi</p>");
    expect(pub.body.data.content).not.toMatch(/script|onclick|javascript:/i);
  });
});

describe("storefront content endpoints & request hygiene", () => {
  it("serves content at the top-level paths the storefront uses", async () => {
    for (const path of ["/api/faqs", "/api/faqs/categories", "/api/blog", "/api/blog/categories", "/api/company-info", "/api/pages/about"]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(200);
    }
    const cats = await request(app).get("/api/blog/categories");
    expect(Array.isArray(cats.body.data)).toBe(true);
    // backward-compatible prefix still works
    expect((await request(app).get("/api/content/faqs")).status).toBe(200);
  });

  it("answers malformed JSON with 400, not 500", async () => {
    const res = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send('{"phone":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_JSON");
  });

  it("ignores malformed catalog filters instead of erroring", async () => {
    const res = await request(app).get("/api/products?minPrice=abc&brandId=not-a-uuid");
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });
});

describe("production configuration guard", () => {
  it("rejects insecure production configuration", () => {
    const errors = productionConfigErrors({ ...env, isProd: true, jwtSecret: "insecure-dev-secret-change-me", corsOrigins: "*", razorpayKeyId: "rzp_x", razorpayKeySecret: "" });
    expect(errors.join(" ")).toMatch(/JWT_SECRET/);
    expect(errors.join(" ")).toMatch(/CORS_ORIGINS/);
    expect(errors.join(" ")).toMatch(/RAZORPAY/);
  });

  it("accepts a correct production configuration", () => {
    process.env.DATABASE_URL ||= "postgresql://x";
    const errors = productionConfigErrors({ ...env, isProd: true, jwtSecret: "a".repeat(64), corsOrigins: "https://shop.example.com", razorpayKeyId: "", razorpayKeySecret: "" });
    expect(errors).toEqual([]);
  });
});
