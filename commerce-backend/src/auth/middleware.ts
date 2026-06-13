import type { NextFunction, Request, Response } from "express";

import { store } from "../db/store.js";
import type { User } from "../db/types.js";
import { resolveEntitlements } from "../billing/plans.js";
import { verifyAccessToken } from "./jwt.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const extractToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return null;
};

/** Require a valid access token; attaches `req.user`. */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "missing_token" });
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    const user = await store.findUserById(payload.sub);
    if (!user) {
      res.status(401).json({ error: "user_not_found" });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
};

/**
 * Guard a route behind a specific entitlement flag. Use after `requireAuth`.
 *
 *   router.post("/ai", requireAuth, requireEntitlement("aiAssist"), handler)
 */
export const requireEntitlement =
  (feature: "collaboration" | "highResExport" | "aiAssist" | "removeBranding") =>
  (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    const entitlements = resolveEntitlements(
      user.plan,
      user.subscriptionStatus,
    );
    if (!entitlements[feature]) {
      res.status(402).json({
        error: "upgrade_required",
        feature,
        message: `Your plan does not include "${feature}". Upgrade to unlock it.`,
      });
      return;
    }
    next();
  };
