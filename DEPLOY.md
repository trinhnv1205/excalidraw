# Deploying Excalidraw (self-hosted, commercial-ready)

This guide covers a production deployment of the full stack — the Excalidraw
frontend, the commerce backend (auth + subscriptions), and a TLS-terminating
reverse proxy — using Docker Compose.

## Architecture

```
                 ┌──────────────────────────────┐
   HTTPS :443 ──▶│            Caddy             │  auto TLS, reverse proxy
                 └───────┬───────────────┬──────┘
                         │ /api/*, /healthz   │ everything else
                         ▼                    ▼
              ┌────────────────────┐  ┌─────────────────────┐
              │  commerce-backend  │  │  excalidraw (nginx) │
              │  Node :3015        │  │  static SPA :80     │
              │  auth + billing    │  └─────────────────────┘
              │  JSON store volume │
              └────────────────────┘
```

## Prerequisites

- A server with Docker + Docker Compose v2.
- A domain name pointed at the server (for automatic HTTPS).
- (Optional) A Stripe account for paid plans.

## 1. Configure

```bash
cp .env.prod.example .env.prod
# Edit .env.prod:
#   DOMAIN=app.example.com
#   JWT_SECRET=$(openssl rand -hex 32)
#   CORS_ORIGIN=https://app.example.com
#   (optional) STRIPE_* keys
```

## 2. Launch

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Caddy obtains a certificate for `DOMAIN` automatically. The site is live at
`https://app.example.com`.

## 3. Verify

```bash
curl -fsS https://app.example.com/healthz   # {"status":"ok",...}
curl -fsS https://app.example.com/readyz     # {"status":"ready",...}
```

## 4. Local / HTTP-only testing

Leave `DOMAIN=:80` in `.env.prod` and browse to `http://localhost`.

## Stripe webhooks

Point a Stripe webhook at `https://app.example.com/api/billing/webhook`,
subscribe to `customer.subscription.*` and `checkout.session.completed`, and put
the signing secret in `STRIPE_WEBHOOK_SECRET`. See
[`commerce-backend/README.md`](commerce-backend/README.md).

## Data & backups

User accounts and subscription state live in the `commerce_data` Docker volume
(`/app/data/store.json`). Back it up regularly:

```bash
docker run --rm -v excalidraw_commerce_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/commerce-backup-$(date +%F).tgz -C /data .
```

For higher scale, swap the JSON store for Postgres by reimplementing the
repository in `commerce-backend/src/db/store.ts` (the interface is small and
already isolated from the route handlers).

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## Other targets

- **Frontend only on Vercel** — `vercel.json` is preconfigured; deploy the
  static SPA and host the commerce backend separately (set
  `VITE_APP_COMMERCE_API_URL` to its URL).
- **Single-container frontend** — the root `Dockerfile` builds just the SPA;
  use it if you don't need the commercial backend.
