# syntax=docker/dockerfile:1
#
# Web image: the public site (landing/, Astro → /srv/site) and the app (the
# Vite bundle → /srv/app) behind Caddy, which also terminates TLS and proxies
# /api to the API replicas (deploy/Caddyfile). BUILD CONTEXT IS THE REPO
# ROOT (shared/ is imported). A deploy ships this image and the backend
# image in the same run — a green backend proves nothing about the bundle
# (CLAUDE.md §9), so the bundle carries its own version at /version.txt.

FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY landing/package.json landing/package.json
RUN npm ci
COPY shared/ shared/
COPY frontend/ frontend/
COPY landing/ landing/
ARG BUILD_VERSION=dev
RUN echo "$BUILD_VERSION" > VERSION \
 && npm run build --workspace=frontend \
 && echo "$BUILD_VERSION" > frontend/dist/version.txt \
 && npm run build --workspace=landing

FROM caddy:2-alpine AS runtime
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/frontend/dist /srv/app
COPY --from=builder /app/landing/dist /srv/site
