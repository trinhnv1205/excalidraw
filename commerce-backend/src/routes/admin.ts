import { Router } from "express";

import { requireAdmin, requireAuth } from "../auth/middleware.js";
import { store, toPublicUser } from "../db/store.js";
import { MONTHLY_PRICE_USD } from "../billing/plans.js";

export const adminRouter = Router();

// Every admin route requires an authenticated admin user.
adminRouter.use(requireAuth, requireAdmin);

const PAID_STATUSES = new Set(["active", "trialing"]);

/** Aggregate metrics for an operations dashboard. */
adminRouter.get("/metrics", async (_req, res) => {
  const [totalUsers, planCounts, totalScenes, recent] = await Promise.all([
    store.countUsers(),
    store.countUsersByPlan(),
    store.countAllScenes(),
    store.listUsers(1000, 0),
  ]);

  // Active subscriptions + MRR estimate from currently-paying users.
  let activeSubscriptions = 0;
  let mrrUsd = 0;
  for (const user of recent) {
    if (user.plan !== "free" && PAID_STATUSES.has(user.subscriptionStatus)) {
      activeSubscriptions += 1;
      mrrUsd += MONTHLY_PRICE_USD[user.plan];
    }
  }

  res.json({
    totalUsers,
    planDistribution: planCounts,
    activeSubscriptions,
    totalScenes,
    mrrUsd,
    currency: "USD",
  });
});

/** Paginated user listing for support / admin views. */
adminRouter.get("/users", async (req, res) => {
  const limit = Math.min(
    Math.max(Number.parseInt(String(req.query.limit ?? "50"), 10) || 50, 1),
    200,
  );
  const offset = Math.max(
    Number.parseInt(String(req.query.offset ?? "0"), 10) || 0,
    0,
  );
  const [users, total] = await Promise.all([
    store.listUsers(limit, offset),
    store.countUsers(),
  ]);
  res.json({
    users: users.map(toPublicUser),
    total,
    limit,
    offset,
  });
});
