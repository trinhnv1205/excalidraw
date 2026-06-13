import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { config } from "./config.js";
import { logger } from "./logger.js";
import { authRouter } from "./routes/auth.js";
import { oauthRouter } from "./routes/oauth.js";
import { meRouter } from "./routes/me.js";
import { accountRouter } from "./routes/account.js";
import { adminRouter } from "./routes/admin.js";
import { scenesRouter } from "./routes/scenes.js";
import { billingRouter } from "./routes/billing.js";
import { healthRouter } from "./health.js";

export const createApp = (): Express => {
  const app = express();

  if (config.trustProxy) {
    // Required for correct client IPs / rate limiting behind nginx/Caddy.
    app.set("trust proxy", 1);
  }

  app.use(
    helmet({
      // API only – no need for a strict CSP that would block nothing here.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow same-origin / curl (no origin) and configured origins.
        if (!origin || config.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("not_allowed_by_cors"));
      },
      credentials: true,
    }),
  );

  // Health checks must be cheap and unauthenticated – mount before parsers.
  app.use(healthRouter);

  // Stripe webhook needs the raw body, so billing router is mounted BEFORE the
  // global json parser. The webhook route applies its own raw() parser.
  app.use("/api/billing", billingRouter);

  // JSON body parser for the rest of the API.
  app.use(express.json({ limit: "100kb" }));

  // Global, generous rate limit (auth routes add a stricter one of their own).
  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use("/api/auth/oauth", oauthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/me", meRouter);
  app.use("/api/account", accountRouter);
  app.use("/api/scenes", scenesRouter);
  app.use("/api/admin", adminRouter);

  app.get("/api", (_req, res) => {
    res.json({ name: "excalidraw-commerce-backend", version: "1.0.0" });
  });

  // 404
  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  // Centralised error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : "internal_error";
    if (message === "not_allowed_by_cors") {
      res.status(403).json({ error: "cors_forbidden" });
      return;
    }
    logger.error("Unhandled error", { message });
    res.status(500).json({ error: "internal_error" });
  });

  return app;
};
