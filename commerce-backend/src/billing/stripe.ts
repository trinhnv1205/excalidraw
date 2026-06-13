import Stripe from "stripe";

import { config } from "../config.js";
import { logger } from "../logger.js";
import { store } from "../db/store.js";
import type { SubscriptionStatus } from "../db/types.js";
import { isValidPlan, type PlanId } from "./plans.js";

/**
 * Stripe is optional: when STRIPE_SECRET_KEY is not configured the service
 * still runs (useful for local dev / free-only deployments) and billing
 * endpoints return 503.
 */
export const stripe: Stripe | null = config.billing.stripeSecretKey
  ? new Stripe(config.billing.stripeSecretKey, {
      apiVersion: "2024-12-18.acacia",
    })
  : null;

export const isBillingConfigured = (): boolean => stripe !== null;

export const priceIdForPlan = (plan: PlanId): string | null => {
  if (plan === "pro") {
    return config.billing.pricePro || null;
  }
  if (plan === "team") {
    return config.billing.priceTeam || null;
  }
  return null;
};

const planForPriceId = (priceId: string | null | undefined): PlanId | null => {
  if (!priceId) {
    return null;
  }
  if (priceId === config.billing.pricePro) {
    return "pro";
  }
  if (priceId === config.billing.priceTeam) {
    return "team";
  }
  return null;
};

const mapStripeStatus = (status: Stripe.Subscription.Status): SubscriptionStatus => {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "none";
  }
};

/** Ensure the user has a Stripe Customer, creating one on first use. */
export const ensureCustomer = async (userId: string): Promise<string> => {
  if (!stripe) {
    throw new Error("billing_not_configured");
  }
  const user = await store.findUserById(userId);
  if (!user) {
    throw new Error("user_not_found");
  }
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: user.id },
  });
  await store.updateUser(user.id, { stripeCustomerId: customer.id });
  return customer.id;
};

export const createCheckoutSession = async (
  userId: string,
  plan: PlanId,
): Promise<string> => {
  if (!stripe) {
    throw new Error("billing_not_configured");
  }
  const price = priceIdForPlan(plan);
  if (!price) {
    throw new Error("invalid_plan");
  }
  const customer = await ensureCustomer(userId);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    success_url: config.billing.successUrl,
    cancel_url: config.billing.cancelUrl,
    allow_promotion_codes: true,
    metadata: { userId, plan },
  });
  if (!session.url) {
    throw new Error("checkout_session_failed");
  }
  return session.url;
};

export const createPortalSession = async (userId: string): Promise<string> => {
  if (!stripe) {
    throw new Error("billing_not_configured");
  }
  const customer = await ensureCustomer(userId);
  const session = await stripe.billingPortal.sessions.create({
    customer,
    return_url: config.billing.portalReturnUrl,
  });
  return session.url;
};

/** Apply a subscription's state to the owning user. */
const syncSubscription = async (
  subscription: Stripe.Subscription,
): Promise<void> => {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const user = await store.findUserByStripeCustomerId(customerId);
  if (!user) {
    logger.warn("Received subscription for unknown customer", { customerId });
    return;
  }
  const priceId = subscription.items.data[0]?.price?.id;
  const plan = planForPriceId(priceId) ?? user.plan;
  const status = mapStripeStatus(subscription.status);
  await store.updateUser(user.id, {
    plan: status === "canceled" || status === "none" ? "free" : plan,
    subscriptionStatus: status,
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : undefined,
  });
  logger.info("Subscription synced", { userId: user.id, plan, status });
};

/**
 * Verify + process a raw Stripe webhook payload.
 * `rawBody` must be the unparsed request body (Buffer/string).
 */
export const handleWebhook = async (
  rawBody: Buffer,
  signature: string,
): Promise<void> => {
  if (!stripe) {
    throw new Error("billing_not_configured");
  }
  if (!config.billing.stripeWebhookSecret) {
    throw new Error("webhook_secret_not_configured");
  }
  const event = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    config.billing.stripeWebhookSecret,
  );

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const planMeta = session.metadata?.plan;
      const userId = session.metadata?.userId;
      if (userId && planMeta && isValidPlan(planMeta)) {
        await store.updateUser(userId, {
          plan: planMeta,
          subscriptionStatus: "active",
        });
      }
      break;
    }
    default:
      // Ignore unrelated events.
      break;
  }
};
