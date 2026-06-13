import React, { useCallback, useEffect, useState } from "react";

import {
  CommerceError,
  type CommerceUser,
  type Entitlements,
  getMe,
  isCommerceEnabled,
  login,
  logout,
  openBillingPortal,
  register,
  startCheckout,
} from "../data/commerce";

import "./CommerceAccount.scss";

type Mode = "login" | "register";

const ENTITLEMENT_LABELS: { key: keyof Entitlements; label: string }[] = [
  { key: "collaboration", label: "Live collaboration" },
  { key: "highResExport", label: "High-res export" },
  { key: "aiAssist", label: "AI assist" },
  { key: "removeBranding", label: "No watermark" },
];

const errorMessage = (error: unknown): string => {
  if (error instanceof CommerceError) {
    switch (error.code) {
      case "invalid_credentials":
        return "Incorrect email or password.";
      case "email_taken":
        return "That email is already registered.";
      case "invalid_input":
        return "Please use a valid email and a password of 8+ characters.";
      case "too_many_requests":
        return "Too many attempts. Please wait a moment.";
      default:
        return "Something went wrong. Please try again.";
    }
  }
  return "Network error. Please try again.";
};

/**
 * Self-contained account & subscription widget. Renders nothing unless a
 * commerce backend is configured (`VITE_APP_COMMERCE_API_URL`), so the OSS
 * build is completely unaffected.
 */
export const CommerceAccount: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<CommerceUser | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);

  const refresh = useCallback(async () => {
    const me = await getMe();
    setUser(me?.user ?? null);
    setEntitlements(me?.entitlements ?? null);
  }, []);

  useEffect(() => {
    if (isCommerceEnabled()) {
      void refresh();
    }
  }, [refresh]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setError(null);
      try {
        if (mode === "register") {
          await register(email, password);
        } else {
          await login(email, password);
        }
        await refresh();
        setPassword("");
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [mode, email, password, refresh],
  );

  const handleLogout = useCallback(() => {
    logout();
    setUser(null);
    setEntitlements(null);
  }, []);

  const handleUpgrade = useCallback(async (plan: "pro" | "team") => {
    setBusy(true);
    setError(null);
    try {
      await startCheckout(plan);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }, []);

  const handlePortal = useCallback(async () => {
    setBusy(true);
    try {
      await openBillingPortal();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }, []);

  if (!isCommerceEnabled()) {
    return null;
  }

  const planName = user ? user.plan.toUpperCase() : "FREE";

  return (
    <div className="commerce-account">
      <button
        type="button"
        className="commerce-account__trigger"
        onClick={() => setOpen(true)}
      >
        {user ? user.email : "Sign in"}
        <span className="commerce-account__badge">{planName}</span>
      </button>

      {open && (
        <div
          className="commerce-account__overlay"
          onClick={() => setOpen(false)}
        >
          <div
            className="commerce-account__modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="commerce-account__close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>

            {error && <p className="commerce-account__error">{error}</p>}

            {user ? (
              <>
                <h2 className="commerce-account__title">Your account</h2>
                <p className="commerce-account__subtitle">
                  Signed in as {user.email} · {planName} plan
                </p>

                {entitlements &&
                  ENTITLEMENT_LABELS.map(({ key, label }) => (
                    <div key={key} className="commerce-account__plan-row">
                      <span>{label}</span>
                      <span>{entitlements[key] ? "✅" : "—"}</span>
                    </div>
                  ))}

                {user.plan === "free" ? (
                  <>
                    <button
                      type="button"
                      className="commerce-account__btn commerce-account__btn--plan"
                      disabled={busy}
                      onClick={() => handleUpgrade("pro")}
                    >
                      Upgrade to Pro
                    </button>
                    <button
                      type="button"
                      className="commerce-account__btn commerce-account__btn--ghost commerce-account__btn--plan"
                      disabled={busy}
                      onClick={() => handleUpgrade("team")}
                    >
                      Upgrade to Team
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="commerce-account__btn commerce-account__btn--plan"
                    disabled={busy}
                    onClick={handlePortal}
                  >
                    Manage billing
                  </button>
                )}

                <div className="commerce-account__switch">
                  <button type="button" onClick={handleLogout}>
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="commerce-account__title">
                  {mode === "login" ? "Welcome back" : "Create your account"}
                </h2>
                <p className="commerce-account__subtitle">
                  {mode === "login"
                    ? "Sign in to access your plan."
                    : "Start free — upgrade anytime."}
                </p>

                <form onSubmit={handleSubmit}>
                  <label className="commerce-account__field">
                    Email
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </label>
                  <label className="commerce-account__field">
                    Password
                    <input
                      type="password"
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      required
                      minLength={8}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                  <button
                    type="submit"
                    className="commerce-account__btn"
                    disabled={busy}
                  >
                    {busy
                      ? "Please wait…"
                      : mode === "login"
                      ? "Sign in"
                      : "Create account"}
                  </button>
                </form>

                <div className="commerce-account__switch">
                  {mode === "login" ? (
                    <>
                      New here?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setMode("register");
                          setError(null);
                        }}
                      >
                        Create an account
                      </button>
                    </>
                  ) : (
                    <>
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setMode("login");
                          setError(null);
                        }}
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
