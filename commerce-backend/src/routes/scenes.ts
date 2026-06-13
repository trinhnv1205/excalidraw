import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../auth/middleware.js";
import { store, toSceneSummary } from "../db/store.js";
import { resolveEntitlements } from "../billing/plans.js";

export const scenesRouter = Router();

// All scene routes require authentication.
scenesRouter.use(requireAuth);

const sceneInputSchema = z.object({
  name: z.string().min(1).max(120),
  data: z.unknown(),
});

const sceneUpdateSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    data: z.unknown().optional(),
  })
  .refine((value) => value.name !== undefined || "data" in value, {
    message: "nothing_to_update",
  });

/** List the current user's scenes (metadata only). */
scenesRouter.get("/", async (req, res) => {
  const user = req.user!;
  const entitlements = resolveEntitlements(user.plan, user.subscriptionStatus);
  const [scenes, used] = await Promise.all([
    store.listScenes(user.id),
    store.countScenes(user.id),
  ]);
  res.json({
    scenes,
    quota: {
      used,
      max: entitlements.maxScenes,
    },
  });
});

/** Create a new cloud scene, enforcing the plan's scene quota. */
scenesRouter.post("/", async (req, res) => {
  const user = req.user!;
  const parsed = sceneInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }

  const entitlements = resolveEntitlements(user.plan, user.subscriptionStatus);
  const used = await store.countScenes(user.id);
  // maxScenes === -1 means unlimited.
  if (entitlements.maxScenes !== -1 && used >= entitlements.maxScenes) {
    res.status(402).json({
      error: "scene_quota_exceeded",
      message: `Your plan allows ${entitlements.maxScenes} saved scenes. Upgrade for unlimited.`,
      quota: { used, max: entitlements.maxScenes },
    });
    return;
  }

  const scene = await store.createScene({
    userId: user.id,
    name: parsed.data.name,
    data: parsed.data.data ?? null,
  });
  res.status(201).json({ scene: toSceneSummary(scene) });
});

/** Fetch a single scene with its full data payload. */
scenesRouter.get("/:id", async (req, res) => {
  const scene = await store.findScene(req.user!.id, req.params.id);
  if (!scene) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ scene });
});

/** Update a scene's name and/or data. */
scenesRouter.put("/:id", async (req, res) => {
  const parsed = sceneUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  const patch: { name?: string; data?: unknown } = {};
  if (parsed.data.name !== undefined) {
    patch.name = parsed.data.name;
  }
  if ("data" in parsed.data) {
    patch.data = parsed.data.data;
  }
  const scene = await store.updateScene(req.user!.id, req.params.id, patch);
  if (!scene) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ scene: toSceneSummary(scene) });
});

/** Delete a scene. */
scenesRouter.delete("/:id", async (req, res) => {
  const deleted = await store.deleteScene(req.user!.id, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(204).end();
});
