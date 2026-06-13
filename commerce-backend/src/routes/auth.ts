import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { config } from "../config.js";
import { store, toPublicUser } from "../db/store.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signAccessToken } from "../auth/jwt.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests" },
});

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(80).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

authRouter.post("/register", authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const { email, password, name } = parsed.data;
  if (store.findUserByEmail(email)) {
    res.status(409).json({ error: "email_taken" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const user = store.createUser({
    email,
    passwordHash,
    name: name ?? email.split("@")[0],
  });
  const token = signAccessToken({ sub: user.id, email: user.email });
  res.status(201).json({ token, user: toPublicUser(user) });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  const { email, password } = parsed.data;
  const user = store.findUserByEmail(email);
  // Constant-ish response to avoid user enumeration.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  const token = signAccessToken({ sub: user.id, email: user.email });
  res.json({ token, user: toPublicUser(user) });
});
