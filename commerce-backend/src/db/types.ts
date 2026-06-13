import type { PlanId } from "../billing/plans.js";

export type SubscriptionStatus =
  | "none"
  | "active"
  | "trialing"
  | "past_due"
  | "canceled";

export interface User {
  id: string;
  email: string;
  /** bcrypt hash – never returned to clients. */
  passwordHash: string;
  name: string;
  createdAt: string;
  updatedAt: string;

  // Billing
  plan: PlanId;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  /** ISO timestamp the current paid period ends (if any). */
  currentPeriodEnd?: string;
}

/** Shape that is safe to return to API clients. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  plan: PlanId;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd?: string;
  createdAt: string;
}

export interface PersistedState {
  users: User[];
}
