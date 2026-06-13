import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_FILE = join(
  mkdtempSync(join(tmpdir(), "commerce-scenes-")),
  "store.json",
);
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";

const { createApp } = await import("../src/app.js");
const app = createApp();

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("scenes + quota", () => {
  let token = "";

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: `scenes-${Date.now()}@example.com`, password: "password123" });
    token = res.body.token;
  });

  it("enforces the free-plan scene quota (3) and then blocks with 402", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post("/api/scenes")
        .set(auth(token))
        .send({ name: `Scene ${i}`, data: { elements: [] } });
      expect(res.status).toBe(201);
    }

    const overflow = await request(app)
      .post("/api/scenes")
      .set(auth(token))
      .send({ name: "Too many", data: {} });
    expect(overflow.status).toBe(402);
    expect(overflow.body.error).toBe("scene_quota_exceeded");
    expect(overflow.body.quota).toEqual({ used: 3, max: 3 });
  });

  it("lists scenes with quota usage", async () => {
    const res = await request(app).get("/api/scenes").set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.scenes).toHaveLength(3);
    expect(res.body.quota).toEqual({ used: 3, max: 3 });
    // Summaries must not leak the data payload.
    expect(res.body.scenes[0]).not.toHaveProperty("data");
  });

  it("reads, updates and deletes a scene; deletion frees quota", async () => {
    const list = await request(app).get("/api/scenes").set(auth(token));
    const id = list.body.scenes[0].id;

    const get = await request(app).get(`/api/scenes/${id}`).set(auth(token));
    expect(get.status).toBe(200);
    expect(get.body.scene).toHaveProperty("data");

    const update = await request(app)
      .put(`/api/scenes/${id}`)
      .set(auth(token))
      .send({ name: "Renamed" });
    expect(update.status).toBe(200);
    expect(update.body.scene.name).toBe("Renamed");

    const del = await request(app).delete(`/api/scenes/${id}`).set(auth(token));
    expect(del.status).toBe(204);

    // Quota freed -> can create again.
    const create = await request(app)
      .post("/api/scenes")
      .set(auth(token))
      .send({ name: "After delete", data: {} });
    expect(create.status).toBe(201);
  });

  it("does not allow access to another user's scene", async () => {
    const other = await request(app)
      .post("/api/auth/register")
      .send({ email: `other-${Date.now()}@example.com`, password: "password123" });
    const mine = await request(app)
      .post("/api/scenes")
      .set(auth(other.body.token))
      .send({ name: "Private", data: {} });
    const sceneId = mine.body.scene.id;

    // Original user must not see it.
    const res = await request(app)
      .get(`/api/scenes/${sceneId}`)
      .set(auth(token));
    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/scenes");
    expect(res.status).toBe(401);
  });
});

describe("account", () => {
  let token = "";
  const email = `account-${Date.now()}@example.com`;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "password123" });
    token = res.body.token;
  });

  it("updates the display name", async () => {
    const res = await request(app)
      .patch("/api/account")
      .set(auth(token))
      .send({ name: "New Name" });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("New Name");
  });

  it("rejects a password change with the wrong current password", async () => {
    const res = await request(app)
      .post("/api/account/password")
      .set(auth(token))
      .send({ currentPassword: "wrong", newPassword: "newpassword123" });
    expect(res.status).toBe(401);
  });

  it("changes the password and lets the user log in with it", async () => {
    const change = await request(app)
      .post("/api/account/password")
      .set(auth(token))
      .send({ currentPassword: "password123", newPassword: "newpassword123" });
    expect(change.status).toBe(200);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "newpassword123" });
    expect(login.status).toBe(200);
  });
});
