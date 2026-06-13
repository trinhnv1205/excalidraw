import { Router, raw } from "express";
import { z } from "zod";

import { requireAuth } from "../auth/middleware.js";
import { logger } from "../logger.js";
import { isValidPlan } from "../billing/plans.js";
import {
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
  isBillingConfigured,
} from "../billing/stripe.js";

export const billingRouter = Router();

const checkoutSchema = z.object({
  plan: z.string().refine(isValidPlan, "invalid_plan"),
});

billingRouter.get("/status", (_req, res) => {
  res.json({ configured: isBillingConfigured() });
});

/** Start a Stripe Checkout session for the chosen paid plan. */
billingRouter.post("/checkout", requireAuth, async (req, res) => {
  if (!isBillingConfigured()) {
    res.status(503).json({ error: "billing_not_configured" });
    return;
  }
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.plan === "free") {
    res.status(400).json({ error: "invalid_plan" });
    return;
  }
  try {
    const url = await createCheckoutSession(req.user!.id, parsed.data.plan);
    res.json({ url });
  } catch (error) {
    logger.error("checkout failed", { error: (error as Error).message });
    res.status(500).json({ error: "checkout_failed" });
  }
});

/** Open the Stripe customer portal so users can manage/cancel billing. */
billingRouter.post("/portal", requireAuth, async (req, res) => {
  if (!isBillingConfigured()) {
    res.status(503).json({ error: "billing_not_configured" });
    return;
  }
  try {
    const url = await createPortalSession(req.user!.id);
    res.json({ url });
  } catch (error) {
    logger.error("portal failed", { error: (error as Error).message });
    res.status(500).json({ error: "portal_failed" });
  }
});

/**
 * Stripe webhook. Mounted with a raw body parser because signature
 * verification needs the exact bytes Stripe sent.
 */
billingRouter.post(
  "/webhook",
  raw({ type: "application/json" }),
  (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string") {
      res.status(400).json({ error: "missing_signature" });
      return;
    }
    try {
      handleWebhook(req.body as Buffer, signature);
      res.json({ received: true });
    } catch (error) {
      logger.error("webhook error", { error: (error as Error).message });
      res.status(400).json({ error: "webhook_error" });
    }
  },
);
