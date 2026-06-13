import "dotenv/config";

/**
 * Centralised, validated runtime configuration.
 *
 * Every value can be supplied through environment variables so the service is
 * fully configurable for self-hosted / containerised deployments.
 */

const bool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const list = (value: string | undefined, fallback: string[]): string[] => {
  if (!value) {
    return fallback;
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export const isProduction = process.env.NODE_ENV === "production";

const jwtSecretFromEnv = process.env.JWT_SECRET;

if (isProduction && (!jwtSecretFromEnv || jwtSecretFromEnv.length < 32)) {
  // Refuse to boot insecurely in production.
  throw new Error(
    "JWT_SECRET must be set to a strong value (>= 32 chars) in production.",
  );
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  isProduction,
  port: int(process.env.PORT, 3015),
  host: process.env.HOST ?? "0.0.0.0",

  /** Comma separated list of allowed CORS origins, e.g. "https://app.example.com". */
  corsOrigins: list(process.env.CORS_ORIGIN, [
    "http://localhost:3000",
    "http://localhost:5001",
  ]),

  auth: {
    jwtSecret:
      jwtSecretFromEnv ?? "dev-only-insecure-secret-change-me-in-production",
    /** Access token lifetime in seconds. */
    accessTokenTtl: int(process.env.ACCESS_TOKEN_TTL, 60 * 60 * 24 * 7),
    bcryptRounds: int(process.env.BCRYPT_ROUNDS, 10),
  },

  storage: {
    /** Path to the JSON-file backed store (durable on a mounted volume). */
    dataFile: process.env.DATA_FILE ?? "./data/store.json",
    /**
     * Postgres connection string. When set, the Postgres store is used instead
     * of the file store, e.g. "postgres://user:pass@host:5432/db".
     */
    databaseUrl: process.env.DATABASE_URL ?? "",
  },

  billing: {
    /** When unset, billing endpoints respond with 503 "billing not configured". */
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    /** Stripe Price IDs for each paid plan. */
    pricePro: process.env.STRIPE_PRICE_PRO ?? "",
    priceTeam: process.env.STRIPE_PRICE_TEAM ?? "",
    /** Where Stripe Checkout / Portal redirect the user back to. */
    successUrl:
      process.env.BILLING_SUCCESS_URL ??
      "http://localhost:3000/?billing=success",
    cancelUrl:
      process.env.BILLING_CANCEL_URL ?? "http://localhost:3000/?billing=cancel",
    portalReturnUrl:
      process.env.BILLING_PORTAL_RETURN_URL ?? "http://localhost:3000/",
  },

  oauth: {
    /** Public base URL of THIS backend, used to build OAuth callback URLs. */
    publicBaseUrl:
      process.env.PUBLIC_BASE_URL ?? `http://localhost:${int(process.env.PORT, 3015)}`,
    /** Where the browser is sent after a successful login (token in URL hash). */
    frontendUrl: process.env.OAUTH_FRONTEND_URL ?? "http://localhost:3000",
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
  },

  admin: {
    /** Comma-separated allow-list of emails granted the admin role. */
    emails: list(process.env.ADMIN_EMAILS, []).map((e) => e.toLowerCase()),
  },

  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: int(process.env.RATE_LIMIT_MAX, 300),
    authMax: int(process.env.RATE_LIMIT_AUTH_MAX, 20),
  },

  trustProxy: bool(process.env.TRUST_PROXY, isProduction),
} as const;

export type AppConfig = typeof config;
