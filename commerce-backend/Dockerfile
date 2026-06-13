# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# Reproducible install from the committed lockfile.
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev dependencies for a slim runtime image.
RUN npm prune --omit=dev

# ---- runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Data directory (mount a volume here for persistence).
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3015
ENV DATA_FILE=/app/data/store.json

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:3015/healthz || exit 1

CMD ["node", "dist/index.js"]
