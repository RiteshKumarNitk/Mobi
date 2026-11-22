import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma";
import { app, cleanupUser, loginAdmin, registerCustomer, uniquePhone } from "./helpers";

const userIds: string[] = [];

afterAll(async () => {
  for (const id of userIds) await cleanupUser(id).catch(() => {});
});

describe("auth", () => {
  it("rejects an invalid phone number", async () => {
    const res = await request(app).post("/api/auth/login").send({ phone: "123", password: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
  });

  it("rejects a wrong password", async () => {
    const { phone, userId } = await registerCustomer();
    userIds.push(userId);
    const res = await request(app).post("/api/auth/login").send({ phone, password: "WrongPass1" });
    expect(res.status).toBe(401);
  });

  it("registers, verifies OTP, and logs in", async () => {
    const { phone, password, token, userId } = await registerCustomer();
    userIds.push(userId);
    expect(token).toBeTruthy();

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.phone).toBe(phone);

    const login = await request(app).post("/api/auth/login").send({ phone, password });
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTruthy();
    expect(login.body.data.refreshToken).toBeTruthy();
  });

  it("rotates tokens via the refresh endpoint", async () => {
    const { phone, password, userId } = await registerCustomer();
    userIds.push(userId);
    const login = await request(app).post("/api/auth/login").send({ phone, password });
    const refreshToken = login.body.data.refreshToken;
    const res = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
  });

  it("rejects an invalid token with 401", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer not-a-token");
    expect(res.status).toBe(401);
  });

  it("blocks customers from admin routes with 403", async () => {
    const { token, userId } = await registerCustomer();
    userIds.push(userId);
    const res = await request(app).get("/api/admin/dashboard").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("requires a token on admin routes with 401", async () => {
    const res = await request(app).get("/api/admin/dashboard");
    expect(res.status).toBe(401);
  });

  it("lets an admin through to the dashboard", async () => {
    const token = await loginAdmin();
    const res = await request(app).get("/api/admin/dashboard").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.metrics).toBeTruthy();
  });

  it("does not send OTPs to unregistered numbers (anti SMS-bombing), with an identical response", async () => {
    const phone = uniquePhone();
    const res = await request(app).post("/api/otp/resend").send({ phone, purpose: "register" });
    expect(res.status).toBe(200);
    expect(res.body.data.otpSent).toBe(true);
    expect(res.body.data.debugCode).toBeNull();
    expect(await prisma.otp.count({ where: { phone } })).toBe(0);
  });

  it("allows OTP resend for a pending (unverified) registration", async () => {
    const phone = uniquePhone();
    const reg = await request(app).post("/api/auth/register").send({ phone, password: "Test@12345", name: "Resend Tester" });
    expect(reg.status).toBe(200);
    const res = await request(app).post("/api/otp/resend").send({ phone, purpose: "register" });
    expect(res.status).toBe(200);
    expect(res.body.data.debugCode).toMatch(/^[0-9]{6}$/);
    // OTPs are stored hashed, never as the plain code
    const stored = await prisma.otp.findFirst({ where: { phone } });
    expect(stored!.code).not.toBe(res.body.data.debugCode);
    await prisma.user.deleteMany({ where: { phone } });
    await prisma.otp.deleteMany({ where: { phone } });
  });
});
