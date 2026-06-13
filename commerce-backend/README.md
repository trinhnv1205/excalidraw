# Excalidraw Commerce Backend

A small, self-contained service that turns a self-hosted Excalidraw into a
commercial product. It provides:

- **Authentication** — email/password register & login, bcrypt hashing, JWT access tokens.
- **Subscriptions** — Stripe Checkout, Customer Portal and webhook-driven plan sync.
- **Feature gating** — plan-based entitlements (`free` / `pro` / `team`) the frontend reads from `/api/me`.
- **Health checks** — `/healthz` (liveness) and `/readyz` (readiness) for orchestrators.
- **Security** — Helmet, CORS allow-list, and rate limiting (stricter on auth).

It is intentionally dependency-light: a JSON-file store (durable on a Docker
volume) backs a clean repository interface you can swap for Postgres later.

## Quick start (local)

```bash
cd commerce-backend
cp .env.example .env        # then set JWT_SECRET
npm install
npm run dev                 # http://localhost:3015
```

## API

| Method | Path                  | Auth | Description                                  |
|--------|-----------------------|------|----------------------------------------------|
| POST   | `/api/auth/register`  | —    | Create account, returns `{ token, user }`    |
| POST   | `/api/auth/login`     | —    | Login, returns `{ token, user }`             |
| GET    | `/api/me`             | ✅   | Current user + resolved `entitlements`       |
| GET    | `/api/me/plans`       | —    | Public plan catalogue (for a pricing page)   |
| GET    | `/api/billing/status` | —    | `{ configured: boolean }`                    |
| POST   | `/api/billing/checkout` | ✅ | `{ plan }` → `{ url }` Stripe Checkout       |
| POST   | `/api/billing/portal` | ✅   | `{ url }` Stripe Customer Portal             |
| POST   | `/api/billing/webhook`| —    | Stripe webhook (raw body, signature-verified)|
| PATCH  | `/api/account`        | ✅   | Update display name                          |
| POST   | `/api/account/password` | ✅ | Change password (needs current password)     |
| GET    | `/api/scenes`         | ✅   | List scenes + `{ quota: { used, max } }`     |
| POST   | `/api/scenes`         | ✅   | Create scene (402 when over plan quota)      |
| GET    | `/api/scenes/:id`     | ✅   | Get one scene with its data                  |
| PUT    | `/api/scenes/:id`     | ✅   | Update scene name/data                       |
| DELETE | `/api/scenes/:id`     | ✅   | Delete scene                                 |
| GET    | `/healthz` `/readyz`  | —    | Health checks                                |

Authenticated requests send `Authorization: Bearer <token>`.

## Plans & entitlements

Defined in [`src/billing/plans.ts`](src/billing/plans.ts). A paid plan only
grants its perks while the Stripe subscription is `active`/`trialing`; otherwise
the user falls back to `free` entitlements automatically.

## Stripe setup

1. Create two recurring Prices in the Stripe dashboard (Pro, Team).
2. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM`.
3. Add a webhook endpoint pointing at `/api/billing/webhook`, subscribe to
   `customer.subscription.*` and `checkout.session.completed`, then set
   `STRIPE_WEBHOOK_SECRET`.

When `STRIPE_SECRET_KEY` is empty the service runs in **free-only** mode and
billing endpoints return `503 billing_not_configured`.

## Tests

```bash
npm test
```

## Production

Use the multi-stage [`Dockerfile`](Dockerfile), or the root
[`docker-compose.prod.yml`](../docker-compose.prod.yml) which wires this service
together with the Excalidraw frontend behind a Caddy reverse proxy. See
[`DEPLOY.md`](../DEPLOY.md).
