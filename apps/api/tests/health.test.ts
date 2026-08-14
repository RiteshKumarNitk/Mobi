import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./helpers";

describe("health & routing", () => {
  it("reports healthy with uptime", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe("healthy");
    expect(typeof res.body.uptimeSeconds).toBe("number");
  });

  it("attaches a request id to every response", async () => {
    const res = await request(app).get("/api/products?pageSize=1");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("returns the standard error shape for unknown routes", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  });
});
