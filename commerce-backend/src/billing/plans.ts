/**
 * Plan + entitlement definitions.
 *
 * This is the single source of truth for "what does each tier unlock".
 * The frontend reads the resolved entitlements from `/api/me` and gates UI
 * accordingly, while the backend enforces limits on protected endpoints.
 */

export type PlanId = "free" | "pro" | "team";

export interface Entitlements {
  /** Max number of saved/cloud scenes. -1 = unlimited. */
  maxScenes: number;
  /** Real-time multiplayer collaboration. */
  collaboration: boolean;
  /** High-resolution / vector (SVG) export without watermark. */
  highResExport: boolean;
  /** AI assisted diagram generation. */
  aiAssist: boolean;
  /** Remove "Made with Excalidraw" style watermark. */
  removeBranding: boolean;
  /** Number of team seats included. */
  seats: number;
  /** Priority support. */
  prioritySupport: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Display price, informational only – real price lives in Stripe. */
  priceLabel: string;
  /** Maps to a Stripe Price ID via config; empty for free. */
  stripePriceEnv: "pricePro" | "priceTeam" | null;
  entitlements: Entitlements;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceLabel: "$0",
    stripePriceEnv: null,
    entitlements: {
      maxScenes: 3,
      collaboration: false,
      highResExport: false,
      aiAssist: false,
      removeBranding: false,
      seats: 1,
      prioritySupport: false,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceLabel: "$8/mo",
    stripePriceEnv: "pricePro",
    entitlements: {
      maxScenes: -1,
      collaboration: true,
      highResExport: true,
      aiAssist: true,
      removeBranding: true,
      seats: 1,
      prioritySupport: false,
    },
  },
  team: {
    id: "team",
    name: "Team",
    priceLabel: "$20/seat/mo",
    stripePriceEnv: "priceTeam",
    entitlements: {
      maxScenes: -1,
      collaboration: true,
      highResExport: true,
      aiAssist: true,
      removeBranding: true,
      seats: 10,
      prioritySupport: true,
    },
  },
};

const PAID_STATUSES = new Set(["active", "trialing"]);

/**
 * Resolve the effective entitlements for a user. A paid plan only grants its
 * perks while the subscription is in an active/trialing state; otherwise the
 * user falls back to Free entitlements.
 */
export const resolveEntitlements = (
  plan: PlanId,
  subscriptionStatus: string,
): Entitlements => {
  if (plan !== "free" && PAID_STATUSES.has(subscriptionStatus)) {
    return PLANS[plan].entitlements;
  }
  return PLANS.free.entitlements;
};

export const isValidPlan = (value: string): value is PlanId =>
  value === "free" || value === "pro" || value === "team";
