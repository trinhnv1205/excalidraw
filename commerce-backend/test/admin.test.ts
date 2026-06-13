import { describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_FILE = join(
  mkdtempSync(join(tmpdir(), "commerce-admin-")),
  "store.json",
);
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.ADMIN_EMAILS = "boss@example.com";

const { createApp } = await import("../src/app.js");
const app = createApp();

const register = async (email: string) => {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "password123" });
  return res.body.token as string;
};

describe("admin", () => {
  it("marks an ADMIN_EMAILS user as admin in /api/me", async () => {
    const token = await register("boss@example.com");
    const res = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("admin");
  });

  it("denies admin endpoints to normal users", async () => {
    const token = await register("normal@example.com");
    const res = await request(app)
      .get("/api/admin/metrics")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/admin/metrics");
    expect(res.status).toBe(401);
  });

  it("returns metrics to an admin", async () => {
    const token = await register("boss@example.com"); // already exists -> login path
    // Re-login to be safe (register would 409 the 2nd time).
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "boss@example.com", password: "password123" });
    const adminToken = login.body.token ?? token;

    const res = await request(app)
      .get("/api/admin/metrics")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalUsers");
    expect(res.body.planDistribution).toHaveProperty("free");
    expect(res.body).toHaveProperty("mrrUsd");
  });

  it("lists users for an admin", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "boss@example.com", password: "password123" });
    const res = await request(app)
      .get("/api/admin/users?limit=10")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThan(0);
    // Public shape – never leak password hashes.
    expect(res.body.users[0]).not.toHaveProperty("passwordHash");
  });
});
