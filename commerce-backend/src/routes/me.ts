import { Router } from "express";

import { requireAuth } from "../auth/middleware.js";
import { toPublicUser } from "../db/store.js";
import { PLANS, resolveEntitlements } from "../billing/plans.js";

export const meRouter = Router();

/** Current user + resolved entitlements – the frontend gates UI from this. */
meRouter.get("/", requireAuth, (req, res) => {
  const user = req.user!;
  res.json({
    user: toPublicUser(user),
    entitlements: resolveEntitlements(user.plan, user.subscriptionStatus),
  });
});

/** Public catalogue of plans for pricing pages. */
meRouter.get("/plans", (_req, res) => {
  res.json({
    plans: Object.values(PLANS).map((plan) => ({
      id: plan.id,
      name: plan.name,
      priceLabel: plan.priceLabel,
      entitlements: plan.entitlements,
    })),
  });
});
