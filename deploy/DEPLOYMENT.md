# Deploying Tezarium

One VM with Docker, two API replicas, Caddy for TLS, Postgres elsewhere.
The code does not assume a cloud (CLAUDE.md §10); the founding posture is
Yandex Cloud if the first customers are in Russia (152-ФЗ).

## What you decide once

| Decision | Where it goes |
|---|---|
| Domain | `DOMAIN` — DNS A/AAAA record → the VM; Caddy gets the certificate itself |
| Container registry | GitHub secrets `REGISTRY`, `IMAGE_REPO`, `REGISTRY_USER`, `REGISTRY_PASSWORD` (any registry that speaks `docker login`; for Yandex CR: `REGISTRY=cr.yandex`, `IMAGE_REPO=cr.yandex/<registry-id>/tezarium`, user `json_key`, password = the service-account key JSON) |
| VM | Ubuntu 24.04, Docker + compose plugin, `docker login` done once as the deploy user, ports 80/443 open |
| Postgres | Managed, or a separate container/VM — `DATABASE_URL` in the VM's `.env`. Not in the compose file on purpose |
| Object storage | `STORAGE_*` in `.env`; unset → `./uploads` on the VM (single-VM only) |

## One-time VM setup

```bash
sudo mkdir -p /opt/tezarium && sudo chown $USER /opt/tezarium
# /opt/tezarium/.env — the app's env (copy .env.example) PLUS:
#   IMAGE_REPO=<same as the GitHub secret>
#   DOMAIN=talks.example.com
#   ADMIN_EMAILS=<your e-mail> — who sees /admin; nobody until this is set.
#   Billing (optional): BILLING_ENABLED=1, TBANK_TERMINAL_KEY, TBANK_PASSWORD,
#   PUBLIC_API_URL=https://<DOMAIN> — T-Bank posts to /api/billing/tbank/notify,
#   which Caddy already proxies with the rest of /api/*. Switch it on with the
#   TEST terminal pair first; the .pptx gate closes for free workspaces the
#   moment it is on.
docker login <REGISTRY>
```

Then on your machine, with `gh` authenticated:

```bash
cp deploy/.env.deploy.example deploy/.env.deploy   # once: fill in VM_HOST, DOMAIN, IMAGE_REPO
./deploy/deploy.sh
```

## What a deploy does

CI builds `…-api:<semver>-<sha>` and `…-web:<semver>-<sha>` on every push
to main. `deploy.sh` then: waits for CI on the exact commit → checks both
images exist → syncs the compose file → pulls, migrates with the same
image, recreates api2 then api then web, each waiting for Docker's own
healthcheck → asserts each replica's `/health` version and the bundle's
`/version.txt` carry this commit's SHA → public check.

## Rollback

Repoint to the previous tag — no re-migration (migrations are
expand/contract, CLAUDE.md §3.11):

```bash
ssh deploy@VM 'cd /opt/tezarium && IMAGE_TAG=<previous> docker compose up -d --force-recreate api2 api web'
```

## Verify by hand

```bash
curl https://DOMAIN/health          # {"ok":true,"version":"0.1.0 (…+sha)"}
curl https://DOMAIN/version.txt     # same string — the bundle, not the API
```
