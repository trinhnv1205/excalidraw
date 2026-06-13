/**
 * Thin, typed client for the commerce backend (auth + billing + entitlements).
 *
 * The access token is persisted in localStorage. UI code can call
 * `getEntitlements()` to gate premium features, and `hasFeature()` for a quick
 * boolean check. All methods no-op gracefully when no backend is configured
 * (`VITE_APP_COMMERCE_API_URL` empty), so the OSS build is unaffected.
 */

import { BRANDING } from "./branding";

export type PlanId = "free" | "pro" | "team";

export interface Entitlements {
  maxScenes: number;
  collaboration: boolean;
  highResExport: boolean;
  aiAssist: boolean;
  removeBranding: boolean;
  seats: number;
  prioritySupport: boolean;
}

export interface CommerceUser {
  id: string;
  email: string;
  name: string;
  plan: PlanId;
  subscriptionStatus: string;
  currentPeriodEnd?: string;
  createdAt: string;
}

const TOKEN_KEY = "excalidraw-commerce-token";

const FREE_ENTITLEMENTS: Entitlements = {
  maxScenes: 3,
  collaboration: false,
  highResExport: false,
  aiAssist: false,
  removeBranding: false,
  seats: 1,
  prioritySupport: false,
};

const baseUrl = (): string | null =>
  BRANDING.commerceApiUrl?.replace(/\/$/, "") ?? null;

export const isCommerceEnabled = (): boolean => baseUrl() !== null;

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

const setToken = (token: string | null): void => {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore storage failures (private mode etc.)
  }
};

class CommerceError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = "CommerceError";
  }
}

const request = async <T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> => {
  const url = baseUrl();
  if (!url) {
    throw new CommerceError("commerce_disabled", 0);
  }
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.auth) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  const res = await fetch(`${url}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new CommerceError(
      typeof data.error === "string" ? data.error : "request_failed",
      res.status,
    );
  }
  return data as T;
};

export const register = async (
  email: string,
  password: string,
  name?: string,
): Promise<CommerceUser> => {
  const data = await request<{ token: string; user: CommerceUser }>(
    "/api/auth/register",
    { method: "POST", body: { email, password, name } },
  );
  setToken(data.token);
  return data.user;
};

export const login = async (
  email: string,
  password: string,
): Promise<CommerceUser> => {
  const data = await request<{ token: string; user: CommerceUser }>(
    "/api/auth/login",
    { method: "POST", body: { email, password } },
  );
  setToken(data.token);
  return data.user;
};

export const logout = (): void => setToken(null);

export const getMe = async (): Promise<{
  user: CommerceUser;
  entitlements: Entitlements;
} | null> => {
  if (!isCommerceEnabled() || !getToken()) {
    return null;
  }
  try {
    return await request<{ user: CommerceUser; entitlements: Entitlements }>(
      "/api/me",
      { auth: true },
    );
  } catch (error) {
    if (error instanceof CommerceError && error.status === 401) {
      setToken(null);
    }
    return null;
  }
};

/** Resolve the current user's entitlements, falling back to Free. */
export const getEntitlements = async (): Promise<Entitlements> => {
  const me = await getMe();
  return me?.entitlements ?? FREE_ENTITLEMENTS;
};

export const hasFeature = async (
  feature: keyof Entitlements,
): Promise<boolean> => {
  const entitlements = await getEntitlements();
  return Boolean(entitlements[feature]);
};

/** Redirect the browser to Stripe Checkout for the chosen plan. */
export const startCheckout = async (
  plan: Exclude<PlanId, "free">,
): Promise<void> => {
  const { url } = await request<{ url: string }>("/api/billing/checkout", {
    method: "POST",
    body: { plan },
    auth: true,
  });
  window.location.href = url;
};

/** Redirect the browser to the Stripe Customer Portal. */
export const openBillingPortal = async (): Promise<void> => {
  const { url } = await request<{ url: string }>("/api/billing/portal", {
    method: "POST",
    auth: true,
  });
  window.location.href = url;
};

export { CommerceError, FREE_ENTITLEMENTS };
