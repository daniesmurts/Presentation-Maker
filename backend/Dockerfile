# syntax=docker/dockerfile:1
#
# Backend API image. BUILD CONTEXT IS THE REPO ROOT, not backend/ — the
# backend imports ../shared and the reproducible install needs the root
# package-lock.json:
#   docker build -f backend/Dockerfile --build-arg BUILD_VERSION="0.1.0 (2026-09-14+abc1234)" .
#
# Debian (-slim), NOT Alpine: @resvg/resvg-js ships linux-x64-GNU prebuilds;
# on musl it falls back to a source build (or fails), which would break the
# formula rendering that has test coverage passing locally and failing in
# prod. Node 22 matches .github/workflows/ci.yml — change both together.

# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

# Manifests first so the dependency layer caches independently of source.
# Every workspace manifest is required — npm ci validates the whole tree.
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY shared/ shared/
COPY backend/ backend/
# tsc has rootDir "../", so the entry point is dist/backend/src/index.js —
# assert it, because a silent layout change would only surface as a
# container that exits immediately.
RUN npm run build --workspace=backend && test -f backend/dist/backend/src/index.js

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/backend/dist backend/dist
# Migrations and the runner ship with the image so the operator migrates with
# the exact code that will serve the traffic.
COPY backend/migrations backend/migrations
COPY backend/scripts/migrate.js backend/scripts/migrate.js
# Vendored fonts for the PDF export — no system font stack in the image —
# and the Russian Trusted Root CA (Минцифры): securepay.tinkoff.ru is
# signed by it and no default trust store has it, so every T-Bank call
# failed with SELF_SIGNED_CERT_IN_CHAIN on the first live checkout
# (2026-09-15). Node reads extra roots from this variable at startup;
# the bundled Mozilla store stays in force for everything else.
COPY backend/assets backend/assets
ENV NODE_EXTRA_CA_CERTS=/app/backend/assets/certs/russian_trusted_ca_bundle.pem

ARG BUILD_VERSION=dev
RUN echo "$BUILD_VERSION" > /app/VERSION

# Local-disk fallback for uploads when object storage is not configured;
# normally a mounted volume in production.
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# cwd MUST be /app/backend: lib/version.ts reads ../VERSION and
# objectStorage.ts resolves ../uploads from cwd.
WORKDIR /app/backend
USER node
EXPOSE 3000

# Config comes from the container environment, never a baked .env — which is
# why this bypasses `npm start` (--env-file on a file that must not exist).
CMD ["node", "dist/backend/src/index.js"]
