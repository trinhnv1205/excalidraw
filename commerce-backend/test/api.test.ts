import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Use an isolated temp data file so tests don't touch real data.
process.env.DATA_FILE = join(
  mkdtempSync(join(tmpdir(), "commerce-test-")),
  "store.json",
);
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";

// Import after env is set so config picks it up.
const { createApp } = await import("../src/app.js");
const app = createApp();

describe("health", () => {
  it("reports liveness", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("reports readiness", async () => {
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
  });
});

describe("plans", () => {
  it("lists public plans", async () => {
    const res = await request(app).get("/api/me/plans");
    expect(res.status).toBe(200);
    expect(res.body.plans.map((p: { id: string }) => p.id)).toEqual([
      "free",
      "pro",
      "team",
    ]);
  });
});

describe("auth + entitlements", () => {
  const email = `user-${Date.now()}@example.com`;
  const password = "supersecret123";
  let token = "";

  it("registers a new user on the free plan", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.plan).toBe("free");
    token = res.body.token;
  });

  it("rejects duplicate registration", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password });
    expect(res.status).toBe(409);
  });

  it("rejects weak passwords", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: `weak-${Date.now()}@example.com`, password: "short" });
    expect(res.status).toBe(400);
  });

  it("logs in with valid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it("rejects invalid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("returns the current user + free entitlements", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.entitlements.maxScenes).toBe(3);
    expect(res.body.entitlements.collaboration).toBe(false);
  });

  it("blocks /api/me without a token", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
  });
});

describe("billing", () => {
  it("reports billing disabled when Stripe is not configured", async () => {
    const res = await request(app).get("/api/billing/status");
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
  });
});

afterAll(() => {
  // nothing to tear down – temp dir is cleaned by the OS
});

beforeAll(() => {
  // placeholder for symmetry / future fixtures
});
