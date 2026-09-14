#!/usr/bin/env bash
# deploy/deploy.sh — pull-based deploy of the CURRENT COMMIT to one VM.
#
#   ./deploy/deploy.sh
#
# Needs on this machine: git, gh (authenticated), ssh to $VM_HOST.
# Needs on the VM: docker + compose, /opt/tezarium/.env (see DEPLOYMENT.md).
#
# The shape (CLAUDE.md §9): CI gate on the exact commit → image guard (pull
# before shipping anything) → compose sync → migrate + rolling restart →
# health per replica → version assertion per replica AND on the served
# bundle → public check. Steps are numbered; a step that always warns is
# removed rather than tolerated. There is no CDN purge because there is no
# CDN.
set -euo pipefail

VM_HOST="${VM_HOST:?set VM_HOST=user@host}"
DOMAIN="${DOMAIN:?set DOMAIN=talks.example.com}"
IMAGE_REPO="${IMAGE_REPO:?set IMAGE_REPO=registry/namespace/tezarium}"
APP_DIR="${APP_DIR:-/opt/tezarium}"

cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Working tree is dirty — deploy commits only. Commit or stash first."; exit 1
fi
if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  echo "⚠ Not on main ($(git rev-parse --abbrev-ref HEAD)). Images are only pushed from main."; exit 1
fi

SEMVER="$(node -p "require('./package.json').version")"
SHORT_SHA="$(git rev-parse --short HEAD)"
IMAGE_TAG="${SEMVER}-${SHORT_SHA}"     # must match ci.yml byte-for-byte
echo "▶ [0/7] Deploying ${IMAGE_TAG} to ${VM_HOST} as https://${DOMAIN}"

# ── [1/7] CI gate — never deploy a tag that hasn't passed ────────────────────
echo "▶ [1/7] Waiting for CI on ${SHORT_SHA}…"
for attempt in $(seq 1 40); do   # 40 × 15 s = 10 min
  read -r status conclusion <<< "$(gh run list --commit "$(git rev-parse HEAD)" --workflow=CI --limit 1 \
    --json status,conclusion --jq '(.[0].status // "not_found") + " " + (.[0].conclusion // "none")' 2>/dev/null || echo "not_found none")"
  if [ "$status" = "completed" ] && [ "$conclusion" = "success" ]; then echo "  ✓ CI passed"; break; fi
  if [ "$status" = "completed" ]; then echo "❌ CI concluded '${conclusion}' for ${SHORT_SHA}. Refusing."; exit 1; fi
  if [ "$attempt" -eq 40 ]; then echo "❌ Timed out waiting for CI."; exit 1; fi
  echo "  … ${status} (${attempt}/40)"; sleep 15
done

# ── [2/7] Image guard — both images must exist before anything ships ────────
echo "▶ [2/7] Checking images in the registry…"
ssh "$VM_HOST" "set -e; for img in ${IMAGE_REPO}-api:${IMAGE_TAG} ${IMAGE_REPO}-web:${IMAGE_TAG}; do
  docker manifest inspect \"\$img\" >/dev/null 2>&1 || { echo \"❌ \$img not in registry — did CI push it?\"; exit 1; }
  echo \"  ✓ \$img\"; done"

# ── [3/7] Sync compose + Caddyfile ──────────────────────────────────────────
echo "▶ [3/7] Syncing compose file → ${VM_HOST}:${APP_DIR}"
ssh "$VM_HOST" "mkdir -p ${APP_DIR}/uploads ${APP_DIR}/certs"
scp -q deploy/docker-compose.yml "${VM_HOST}:${APP_DIR}/docker-compose.yml"

# ── [4/7] Pull, migrate, rolling restart ────────────────────────────────────
echo "▶ [4/7] Pull, migrate, rolling restart…"
# Unquoted heredoc: IMAGE_TAG etc. are substituted HERE, not on the VM.
ssh "$VM_HOST" bash -s <<REMOTE
set -euo pipefail
cd "${APP_DIR}"
export IMAGE_REPO="${IMAGE_REPO}" IMAGE_TAG="${IMAGE_TAG}" DOMAIN="${DOMAIN}"
docker compose pull -q api api2 web migrate
# One-shot migration with the image about to serve traffic. -T and the
# stdin redirect are load-bearing: \`docker compose run\` forwards its own
# stdin into the container, and here stdin IS the rest of this heredoc —
# the parent lost three deploys to the commands after this line being
# silently eaten as the migration container's input.
docker compose run --rm -T migrate < /dev/null

wait_healthy() {
  for i in \$(seq 1 24); do
    s="\$(docker inspect "\$1" --format '{{.State.Health.Status}}' 2>/dev/null || echo missing)"
    [ "\$s" = "healthy" ] && return 0
    sleep 5
  done
  echo "❌ \$1 not healthy after 120 s (\$s). Recent logs:"; docker logs "\$1" --tail=30 2>&1 | sed 's/^/    /'; return 1
}
# One replica at a time so Caddy always has a live upstream.
docker compose up -d --force-recreate api2; wait_healthy tezarium-api-2; echo "  ✓ api2"
docker compose up -d --force-recreate api;  wait_healthy tezarium-api;   echo "  ✓ api"
docker compose up -d --force-recreate web;  echo "  ✓ web"

for name in tezarium-api tezarium-api-2; do
  actual="\$(docker inspect "\$name" --format '{{.Config.Image}}')"
  [ "\$actual" = "${IMAGE_REPO}-api:${IMAGE_TAG}" ] || { echo "❌ \$name runs \$actual"; exit 1; }
done
docker image prune -f >/dev/null
REMOTE

# ── [5/7] Health per replica, from the VM ───────────────────────────────────
echo "▶ [5/7] Health per replica…"
ssh "$VM_HOST" 'set -e
  for name in tezarium-api tezarium-api-2; do
    ok=""
    for i in 1 2 3 4 5 6; do
      docker exec "$name" node -e "require(\"http\").get(\"http://127.0.0.1:3000/health\",r=>process.exit(r.statusCode===200?0:1)).on(\"error\",()=>process.exit(1))" && { ok=1; break; }
      sleep 5
    done
    [ -n "$ok" ] || { echo "  ✗ $name"; docker logs "$name" --tail=30 2>&1 | sed "s/^/    /"; exit 1; }
    echo "  ✓ $name"
  done'

# ── [6/7] Version assertion — API replicas AND the served bundle ────────────
# "The site is up" is not "the deploy worked": a container that was never
# recreated answers every health check while serving last week's code, and a
# green backend proves nothing about the bundle.
echo "▶ [6/7] Confirming ${SHORT_SHA} is what is being served…"
ssh "$VM_HOST" "set -e
  for name in tezarium-api tezarium-api-2; do
    live=\$(docker exec \"\$name\" node -e \"require('http').get('http://127.0.0.1:3000/health',r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>process.stdout.write(JSON.parse(b).version))})\")
    case \"\$live\" in *${SHORT_SHA}*) echo \"  ✓ \$name serving \$live\" ;; *) echo \"  ✗ \$name serving '\$live'\"; exit 1 ;; esac
  done
  bundle=\$(curl -fsS --max-time 10 https://${DOMAIN}/version.txt)
  case \"\$bundle\" in *${SHORT_SHA}*) echo \"  ✓ bundle serving \$bundle\" ;; *) echo \"  ✗ bundle serving '\$bundle'\"; exit 1 ;; esac"

# ── [7/7] Public check from here (best-effort) ──────────────────────────────
echo "▶ [7/7] Public check from this machine…"
if curl -fsS --max-time 12 "https://${DOMAIN}/health" >/dev/null; then echo "  ✓ https://${DOMAIN}/health"
else echo "  ⚠ not reachable from here — VM-side checks passed; likely local network."; fi
echo "✅ Deployed ${IMAGE_TAG}."
