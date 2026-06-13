import { describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_FILE = join(
  mkdtempSync(join(tmpdir(), "commerce-oauth-")),
  "store.json",
);
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
// Ensure OAuth providers are unconfigured for this test.
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GITHUB_CLIENT_ID;

const { createApp } = await import("../src/app.js");
const app = createApp();

describe("oauth (unconfigured)", () => {
  it("reports both providers disabled", async () => {
    const res = await request(app).get("/api/auth/oauth");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ google: false, github: false });
  });

  it("returns 404 when starting an unconfigured provider", async () => {
    const res = await request(app).get("/api/auth/oauth/google/start");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("provider_not_available");
  });

  it("returns 404 for an unknown provider", async () => {
    const res = await request(app).get("/api/auth/oauth/twitter/start");
    expect(res.status).toBe(404);
  });
});
