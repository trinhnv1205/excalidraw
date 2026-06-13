# Commercializing Excalidraw

Excalidraw is **MIT licensed**, so you are already free to use, modify, sell, and
host it commercially. This repository adds the missing product pieces to turn the
open-source editor into a sellable SaaS:

| Capability            | Where                                             |
|-----------------------|---------------------------------------------------|
| Accounts / auth       | `commerce-backend/` (JWT, bcrypt)                 |
| Subscriptions         | `commerce-backend/` (Stripe Checkout + Portal)    |
| Plan-based gating      | `commerce-backend/src/billing/plans.ts`           |
| Frontend integration  | `excalidraw-app/data/commerce.ts`                 |
| White-label branding  | `excalidraw-app/data/branding.ts` + `VITE_APP_BRAND_*` |
| Production deploy      | `docker-compose.prod.yml`, `deploy/Caddyfile`, `DEPLOY.md` |

## Plans

| Plan | Scenes | Collaboration | Hi-res export | AI assist | Remove branding | Seats |
|------|--------|---------------|---------------|-----------|-----------------|-------|
| Free | 3      | —             | —             | —         | —               | 1     |
| Pro  | ∞      | ✅            | ✅            | ✅        | ✅              | 1     |
| Team | ∞      | ✅            | ✅            | ✅        | ✅              | 10    |

Edit [`commerce-backend/src/billing/plans.ts`](commerce-backend/src/billing/plans.ts)
to change limits or add tiers. The frontend reads resolved entitlements from
`/api/me`, so gating stays in sync automatically.

## Gating a premium feature (frontend)

```ts
import { hasFeature, startCheckout } from "./data/commerce";

if (await hasFeature("highResExport")) {
  exportHighRes();
} else {
  // prompt upgrade
  await startCheckout("pro");
}
```

## Gating a premium endpoint (backend)

```ts
import { requireAuth, requireEntitlement } from "./auth/middleware.js";

router.post("/ai/generate", requireAuth, requireEntitlement("aiAssist"), handler);
```

## White-labelling

Set `VITE_APP_BRAND_*` variables at build time to ship under your own brand —
no code changes required:

```bash
VITE_APP_BRAND_NAME="DrawForge" \
VITE_APP_BRAND_TAGLINE="Diagrams" \
VITE_APP_BRAND_PRIMARY_COLOR="#0ea5e9" \
VITE_APP_BRAND_LOGO_URL="/brand/logo.svg" \
yarn build:app
```

## Legal checklist before selling

- ✅ **License**: MIT permits commercial use; keep the `LICENSE` file and
  attribution notices intact.
- Add your own **Terms of Service** and **Privacy Policy** (you now collect
  emails + payment data via Stripe).
- Stripe handles PCI scope; never store raw card data.
- If you target the EU, document your **GDPR** data handling (the only PII stored
  is email + name in the commerce store).

## Roadmap ideas (not yet implemented)

- OAuth / SSO (Google, GitHub) login.
- Postgres storage adapter + migrations.
- Team seat management UI and per-org workspaces.
- Usage metering for AI features.
- Admin dashboard.
