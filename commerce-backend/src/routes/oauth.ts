import { Router } from "express";
import jwt from "jsonwebtoken";

import { config } from "../config.js";
import { logger } from "../logger.js";
import { store } from "../db/store.js";
import { signAccessToken } from "../auth/jwt.js";
import type { OAuthProvider, User } from "../db/types.js";

export const oauthRouter = Router();

interface NormalizedProfile {
  providerId: string;
  email: string;
  name: string;
}

const isProvider = (value: string): value is OAuthProvider =>
  value === "google" || value === "github";

const providerConfig = (provider: OAuthProvider) =>
  provider === "google" ? config.oauth.google : config.oauth.github;

export const isProviderConfigured = (provider: OAuthProvider): boolean => {
  const cfg = providerConfig(provider);
  return Boolean(cfg.clientId && cfg.clientSecret);
};

const callbackUrl = (provider: OAuthProvider): string =>
  `${config.oauth.publicBaseUrl.replace(/\/$/, "")}/api/auth/oauth/${provider}/callback`;

const authorizeUrl = (provider: OAuthProvider, state: string): string => {
  const cfg = providerConfig(provider);
  const redirectUri = callbackUrl(provider);
  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    scope: "read:user user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
};

const exchangeAndFetchProfile = async (
  provider: OAuthProvider,
  code: string,
): Promise<NormalizedProfile> => {
  const cfg = providerConfig(provider);
  const redirectUri = callbackUrl(provider);

  if (provider === "google") {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) {
      throw new Error("token_exchange_failed");
    }
    const profileRes = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    const profile = (await profileRes.json()) as {
      sub?: string;
      email?: string;
      name?: string;
    };
    if (!profile.sub || !profile.email) {
      throw new Error("profile_fetch_failed");
    }
    return {
      providerId: profile.sub,
      email: profile.email,
      name: profile.name || profile.email.split("@")[0],
    };
  }

  // GitHub
  const tokenRes = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: redirectUri,
      }),
    },
  );
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) {
    throw new Error("token_exchange_failed");
  }
  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "excalidraw-commerce",
  };
  const userRes = await fetch("https://api.github.com/user", { headers });
  const ghUser = (await userRes.json()) as {
    id?: number;
    name?: string;
    login?: string;
    email?: string;
  };
  if (!ghUser.id) {
    throw new Error("profile_fetch_failed");
  }
  let email = ghUser.email;
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers,
    });
    const emails = (await emailsRes.json()) as {
      email: string;
      primary: boolean;
      verified: boolean;
    }[];
    email =
      emails.find((e) => e.primary && e.verified)?.email ?? emails[0]?.email;
  }
  if (!email) {
    throw new Error("email_unavailable");
  }
  return {
    providerId: String(ghUser.id),
    email,
    name: ghUser.name || ghUser.login || email.split("@")[0],
  };
};

/** Find an existing user by provider id or email, else create one. */
const findOrCreateUser = async (
  provider: OAuthProvider,
  profile: NormalizedProfile,
): Promise<User> => {
  const linkField = provider === "google" ? "googleId" : "githubId";

  const byProvider = await store.findUserByProvider(
    provider,
    profile.providerId,
  );
  if (byProvider) {
    return byProvider;
  }

  // Link to an existing email-based account if one exists.
  const byEmail = await store.findUserByEmail(profile.email);
  if (byEmail) {
    const updated = await store.updateUser(byEmail.id, {
      [linkField]: profile.providerId,
    });
    return updated ?? byEmail;
  }

  return store.createUser({
    email: profile.email,
    name: profile.name,
    [linkField]: profile.providerId,
  });
};

const signState = (provider: OAuthProvider): string =>
  jwt.sign({ provider, t: "oauth_state" }, config.auth.jwtSecret, {
    expiresIn: 600,
  });

const verifyState = (state: string, provider: OAuthProvider): boolean => {
  try {
    const decoded = jwt.verify(state, config.auth.jwtSecret);
    return (
      typeof decoded === "object" &&
      decoded !== null &&
      (decoded as { t?: string }).t === "oauth_state" &&
      (decoded as { provider?: string }).provider === provider
    );
  } catch {
    return false;
  }
};

/** Begin the OAuth flow: redirect the browser to the provider. */
oauthRouter.get("/:provider/start", (req, res) => {
  const { provider } = req.params;
  if (!isProvider(provider) || !isProviderConfigured(provider)) {
    res.status(404).json({ error: "provider_not_available" });
    return;
  }
  res.redirect(authorizeUrl(provider, signState(provider)));
});

/** Provider redirect target: exchange the code and issue our own JWT. */
oauthRouter.get("/:provider/callback", async (req, res) => {
  const { provider } = req.params;
  if (!isProvider(provider) || !isProviderConfigured(provider)) {
    res.status(404).json({ error: "provider_not_available" });
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const frontend = config.oauth.frontendUrl.replace(/\/$/, "");

  if (!code || !verifyState(state, provider)) {
    res.redirect(`${frontend}/?auth=error`);
    return;
  }

  try {
    const profile = await exchangeAndFetchProfile(provider, code);
    const user = await findOrCreateUser(provider, profile);
    const token = signAccessToken({ sub: user.id, email: user.email });
    // Hand the token to the SPA via the URL fragment (not sent to servers/logs).
    res.redirect(`${frontend}/?auth=success#token=${encodeURIComponent(token)}`);
    logger.info("OAuth login", { provider, userId: user.id });
  } catch (error) {
    logger.error("OAuth callback failed", {
      provider,
      error: (error as Error).message,
    });
    res.redirect(`${frontend}/?auth=error`);
  }
});

/** Public discovery so the frontend can show only enabled providers. */
oauthRouter.get("/", (_req, res) => {
  res.json({
    google: isProviderConfigured("google"),
    github: isProviderConfigured("github"),
  });
});
