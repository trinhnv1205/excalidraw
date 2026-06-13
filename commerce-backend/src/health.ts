import { Router } from "express";

import { store } from "./db/store.js";
import { isBillingConfigured } from "./billing/stripe.js";

export const healthRouter = Router();

/** Liveness: process is up. */
healthRouter.get("/healthz", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

/** Readiness: dependencies reachable / store loadable. */
healthRouter.get("/readyz", async (_req, res) => {
  try {
    const users = await store.countUsers();
    res.json({
      status: "ready",
      users,
      billing: isBillingConfigured() ? "configured" : "disabled",
    });
  } catch {
    res.status(503).json({ status: "not_ready" });
  }
});
