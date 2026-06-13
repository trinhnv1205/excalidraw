import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../auth/middleware.js";
import { store, toPublicUser } from "../db/store.js";
import { hashPassword, verifyPassword } from "../auth/password.js";

export const accountRouter = Router();

accountRouter.use(requireAuth);

const updateSchema = z.object({
  name: z.string().min(1).max(80),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

/** Update profile fields (currently just the display name). */
accountRouter.patch("/", (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  const updated = store.updateUser(req.user!.id, { name: parsed.data.name });
  if (!updated) {
    res.status(404).json({ error: "user_not_found" });
    return;
  }
  res.json({ user: toPublicUser(updated) });
});

/** Change the account password (requires the current password). */
accountRouter.post("/password", async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  const user = req.user!;
  const ok = await verifyPassword(
    parsed.data.currentPassword,
    user.passwordHash,
  );
  if (!ok) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  const passwordHash = await hashPassword(parsed.data.newPassword);
  store.updateUser(user.id, { passwordHash });
  res.json({ ok: true });
});
