import React, { useCallback, useEffect, useState } from "react";

import {
  CommerceError,
  type CommerceUser,
  type Entitlements,
  type PlanInfo,
  type SceneQuota,
  type SceneSummary,
  createScene,
  deleteScene,
  getMe,
  getOAuthProviders,
  getPlans,
  getScene,
  isCommerceEnabled,
  listScenes,
  login,
  logout,
  oauthStartUrl,
  openBillingPortal,
  register,
  startCheckout,
} from "../data/commerce";
import {
  captureCurrentScene,
  hasExcalidrawAPI,
  loadSceneIntoEditor,
} from "../data/commerceScene";

import "./CommerceAccount.scss";

type Mode = "login" | "register";
type View = "main" | "plans";

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
      case "scene_quota_exceeded":
        return "You've reached your plan's saved-drawing limit. Upgrade for unlimited.";
      default:
        return "Something went wrong. Please try again.";
    }
  }
  return "Network error. Please try again.";
};

/**
 * Self-contained account, subscription, pricing and cloud-drawings widget.
 * Renders nothing unless a commerce backend is configured.
 */
export const CommerceAccount: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("main");
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<CommerceUser | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [providers, setProviders] = useState({ google: false, github: false });
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [scenes, setScenes] = useState<SceneSummary[]>([]);
  const [quota, setQuota] = useState<SceneQuota | null>(null);

  const refresh = useCallback(async () => {
    const me = await getMe();
    setUser(me?.user ?? null);
    setEntitlements(me?.entitlements ?? null);
    if (me) {
      const { scenes: list, quota: q } = await listScenes();
      setScenes(list);
      setQuota(q);
    } else {
      setScenes([]);
      setQuota(null);
    }
  }, []);

  useEffect(() => {
    if (!isCommerceEnabled()) {
      return;
    }
    void refresh();
    void getOAuthProviders().then(setProviders);
  }, [refresh]);

  const loadPlans = useCallback(async () => {
    if (plans.length === 0) {
      try {
        setPlans(await getPlans());
      } catch {
        // ignore – pricing is best-effort
      }
    }
    setView("plans");
  }, [plans.length]);

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
    setScenes([]);
    setQuota(null);
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

  const handleSaveCurrent = useCallback(async () => {
    const snapshot = captureCurrentScene();
    if (!snapshot) {
      setError("Open a drawing first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createScene(`Drawing ${new Date().toLocaleString()}`, snapshot);
      const { scenes: list, quota: q } = await listScenes();
      setScenes(list);
      setQuota(q);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof CommerceError && err.status === 402) {
        await loadPlans();
      }
    } finally {
      setBusy(false);
    }
  }, [loadPlans]);

  const handleOpenScene = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const { scene } = await getScene(id);
      if (loadSceneIntoEditor(scene.data)) {
        setOpen(false);
      } else {
        setError("Couldn't load this drawing.");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDeleteScene = useCallback(async (id: string) => {
    setBusy(true);
    try {
      await deleteScene(id);
      const { scenes: list, quota: q } = await listScenes();
      setScenes(list);
      setQuota(q);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);

  if (!isCommerceEnabled()) {
    return null;
  }

  const planName = user ? user.plan.toUpperCase() : "FREE";

  const renderPlans = () => (
    <>
      <h2 className="commerce-account__title">Plans</h2>
      <p className="commerce-account__subtitle">
        Upgrade to unlock unlimited drawings and premium features.
      </p>
      {plans.map((plan) => (
        <div key={plan.id} className="commerce-account__plan-card">
          <div className="commerce-account__plan-head">
            <strong>{plan.name}</strong>
            <span>{plan.priceLabel}</span>
          </div>
          {plan.id !== "free" && (
            <button
              type="button"
              className="commerce-account__btn commerce-account__btn--plan"
              disabled={busy || !user}
              onClick={() => handleUpgrade(plan.id as "pro" | "team")}
            >
              {user ? `Choose ${plan.name}` : "Sign in to upgrade"}
            </button>
          )}
        </div>
      ))}
      <div className="commerce-account__switch">
        <button type="button" onClick={() => setView("main")}>
          ← Back
        </button>
      </div>
    </>
  );

  const renderCloud = () => (
    <>
      <div className="commerce-account__plan-row">
        <strong>Cloud drawings</strong>
        {quota && (
          <span>
            {quota.used}/{quota.max === -1 ? "∞" : quota.max}
          </span>
        )}
      </div>
      <button
        type="button"
        className="commerce-account__btn commerce-account__btn--plan"
        disabled={busy || !hasExcalidrawAPI()}
        onClick={handleSaveCurrent}
      >
        Save current drawing
      </button>
      {scenes.map((scene) => (
        <div key={scene.id} className="commerce-account__scene-row">
          <button
            type="button"
            className="commerce-account__scene-open"
            disabled={busy}
            onClick={() => handleOpenScene(scene.id)}
          >
            {scene.name}
          </button>
          <button
            type="button"
            className="commerce-account__scene-del"
            aria-label="Delete"
            disabled={busy}
            onClick={() => handleDeleteScene(scene.id)}
          >
            🗑
          </button>
        </div>
      ))}
    </>
  );

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

            {view === "plans" ? (
              renderPlans()
            ) : user ? (
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

                {renderCloud()}

                {user.plan === "free" ? (
                  <button
                    type="button"
                    className="commerce-account__btn commerce-account__btn--plan"
                    disabled={busy}
                    onClick={loadPlans}
                  >
                    See plans & upgrade
                  </button>
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

                {(providers.google || providers.github) && (
                  <div className="commerce-account__oauth">
                    {providers.google && (
                      <a
                        className="commerce-account__btn commerce-account__btn--ghost"
                        href={oauthStartUrl("google") ?? "#"}
                      >
                        Continue with Google
                      </a>
                    )}
                    {providers.github && (
                      <a
                        className="commerce-account__btn commerce-account__btn--ghost"
                        href={oauthStartUrl("github") ?? "#"}
                      >
                        Continue with GitHub
                      </a>
                    )}
                    <div className="commerce-account__divider">or</div>
                  </div>
                )}

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
                <div className="commerce-account__switch">
                  <button type="button" onClick={loadPlans}>
                    View plans
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
