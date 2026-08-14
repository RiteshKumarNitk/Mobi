import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, createProduct, deleteProduct, loginAdmin } from "./helpers";

describe("catalog", () => {
  it("lists products with pagination and bulk pricing fields", async () => {
    const res = await request(app).get("/api/products?pageSize=5");
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBe(5);
    const p = res.body.data.items[0];
    expect(p.id).toBeTruthy();
    expect(p.name).toBeTruthy();
    expect(typeof p.price).toBe("string");
    expect("boxPrice" in p).toBe(true);
    expect("boxQuantity" in p).toBe(true);
    expect("hsnCode" in p).toBe(true);
  });

  it("search is case-insensitive (regression for the battery bug)", async () => {
    const upper = await request(app).get("/api/products?q=Battery&pageSize=50");
    const lower = await request(app).get("/api/products?q=battery&pageSize=50");
    expect(upper.status).toBe(200);
    expect(lower.status).toBe(200);
    expect(lower.body.data.total).toBeGreaterThan(0);
    expect(lower.body.data.total).toBe(upper.body.data.total);
  });

  it("returns 404 for a missing product", async () => {
    const res = await request(app).get("/api/products/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("exposes categories, brands, and banners", async () => {
    const [cats, brands, banners] = await Promise.all([
      request(app).get("/api/categories"),
      request(app).get("/api/brands"),
      request(app).get("/api/banners/active"),
    ]);
    expect(cats.status).toBe(200);
    expect(cats.body.data.length).toBeGreaterThan(0);
    expect(brands.status).toBe(200);
    expect(brands.body.data.length).toBeGreaterThan(0);
    expect(banners.status).toBe(200);
  });

  it("returns suggestions for a partial query", async () => {
    const res = await request(app).get("/api/search/suggest?q=sam");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.products)).toBe(true);
  });

  it("caches reads (MISS then HIT) and busts the cache on admin writes", async () => {
    const first = await request(app).get("/api/products?pageSize=3");
    expect(first.headers["x-cache"]).toBe("MISS");

    const second = await request(app).get("/api/products?pageSize=3");
    expect(second.headers["x-cache"]).toBe("HIT");
    expect(second.body.data.items.length).toBe(first.body.data.items.length);

    const admin = await loginAdmin();
    const created = await createProduct(admin, { price: 1234, name: "TST CacheBust Probe" });

    const after = await request(app).get("/api/products?q=CacheBust&pageSize=10");
    expect(after.status).toBe(200);
    expect(after.body.data.total).toBeGreaterThanOrEqual(1);
    const names = after.body.data.items.map((i: any) => i.name);
    expect(names).toContain(created.name);

    await deleteProduct(created.id);
  });
});
