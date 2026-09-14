# Tezarium on Yandex Cloud — MVP setup, sized to grow

The smallest set of resources that runs the product properly, chosen so
that each one scales later by changing a setting rather than by
re-architecting. Everything here is what `deploy/deploy.sh` and
`deploy/docker-compose.yml` expect; nothing else is needed.

Four resources, one cloud folder: **a VM**, **Managed PostgreSQL**, an
**Object Storage bucket**, a **Container Registry**. Plus DNS, one service
account, and four GitHub secrets.

Prices change; check the calculator (console → Pricing) before creating.
Order of magnitude for this MVP: the smallest presets below run to a few
thousand ₽/month in total, most of it the database.

---

## 0. Before the console

- A Yandex Cloud account with billing enabled, one **folder** (default is fine).
- Install and authenticate the CLI on your machine — it makes steps 3–5
  copy-pasteable: https://yandex.cloud/docs/cli/quickstart, then `yc init`.
- A domain you control (e.g. `tezarium.ru` or a subdomain like `app.tezarium.ru`).
- A DeepSeek API key (you have one).

## 1. Service account (one, two roles)

Console → *Identity and Access Management* → *Service accounts* → Create:
name `tezarium-ops`. Assign roles on the folder:

- `container-registry.images.pusher` — CI pushes images
- `storage.editor` — the app reads/writes slide images

Then two keys from it:

```bash
# Authorized key (JSON) — used by GitHub Actions AND by the VM to pull images
yc iam key create --service-account-name tezarium-ops --output tezarium-ops-key.json

# Static access key — used by the app for Object Storage (S3 API)
yc iam access-key create --service-account-name tezarium-ops
#  → note key_id and secret (the secret is shown ONCE)
```

Keep both files out of the repo.

## 2. Container Registry

Console → *Container Registry* → Create registry: name `tezarium`. Note its
**ID** (looks like `crp1abc…`). Repositories (`tezarium-api`, `tezarium-web`)
are created automatically on first push.

GitHub → repository → *Settings → Secrets and variables → Actions*, four
secrets:

| Secret | Value |
|---|---|
| `REGISTRY` | `cr.yandex` |
| `IMAGE_REPO` | `cr.yandex/<registry-id>/tezarium` |
| `REGISTRY_USER` | `json_key` |
| `REGISTRY_PASSWORD` | the **entire contents** of `tezarium-ops-key.json` |

From the next push to `main`, CI pushes `…/tezarium-api:<semver>-<sha>` and
`…/tezarium-web:<semver>-<sha>`. Verify in the console under the registry.

## 3. Managed PostgreSQL (MVP: one host; later: add hosts)

Console → *Managed Service for PostgreSQL* → Create cluster:

| Setting | MVP | Later |
|---|---|---|
| Version | 16 | — |
| Host class | `b1.medium` (burstable, 2 vCPU 50%, 4 GB) | `s3-c2-m8` or larger — change in place, minutes of restart |
| Storage | network-ssd, 20 GB | grow in place, no downtime |
| Hosts | 1, same zone as the VM (e.g. `ru-central1-a`) | add a 2nd/3rd host → automatic failover, no app change |
| Database | `tezarium`, user `tezarium`, a long password | — |
| Network / SG | same network as the VM; security group allowing 6432 from the VM's SG | — |
| Public access | **off** — the VM reaches it over the private network | — |

The connection string the app needs (port **6432** — the cluster's
connection pooler, not 5432):

```
postgresql://tezarium:PASSWORD@<host-fqdn>:6432/tezarium
```

Yandex signs its servers with its own CA. Download it once for the VM
(step 5 mounts it into the containers):

```bash
curl -fsS https://storage.yandexcloud.net/cloud-certs/CA.pem -o root.crt
```

## 4. Object Storage

Console → *Object Storage* → Create bucket: name `tezarium-media` (bucket
names are global — pick something unique), access **restricted** (private),
storage class Standard, no public read. The static key from step 1 is what
the app uses. Later: nothing to resize — it just grows.

## 5. The VM (MVP: 2 vCPU / 4 GB; later: bigger, or a second one)

Console → *Compute Cloud* → Create VM:

| Setting | MVP | Later |
|---|---|---|
| Image | Ubuntu 24.04 LTS | — |
| Platform / vCPU | Intel Ice Lake, **2 vCPU at 50% (burstable)**, 4 GB RAM | 100% cores, more RAM: stop → change → start (~2 min downtime). Or add a second VM behind a Network Load Balancer — the app is already two stateless replicas, so nothing in the code changes |
| Disk | network-ssd 30 GB | grow in place |
| Zone | same as the database | — |
| Public IP | **yes**, static (reserve it: *Virtual Private Cloud → IP addresses*) | — |
| Security group | inbound 22 from your IP, 80 and 443 from anywhere; outbound all | — |
| SSH | your public key, login `deploy` | — |

Then on the VM (`ssh deploy@<ip>`):

```bash
# Docker + compose plugin
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER && newgrp docker

# App directory and the database CA
sudo mkdir -p /opt/tezarium && sudo chown $USER /opt/tezarium
mkdir -p /opt/tezarium/certs /opt/tezarium/uploads
# copy root.crt from step 3 to /opt/tezarium/certs/root.crt (scp from your machine)

# Registry login (once) — the same JSON key as CI
cat tezarium-ops-key.json | docker login cr.yandex --username json_key --password-stdin
```

`/opt/tezarium/.env` — the app's environment plus the two deploy variables:

```
NODE_ENV=production
PORT=3000
DOMAIN=app.tezarium.ru
IMAGE_REPO=cr.yandex/<registry-id>/tezarium

DATABASE_URL=postgresql://tezarium:PASSWORD@<host-fqdn>:6432/tezarium
DATABASE_SSL_CA=/app/certs/root.crt
DB_POOL_MAX=10

JWT_SECRET=<openssl rand -hex 32>
DEEPSEEK_API_KEY=<your key>

STORAGE_ENDPOINT=https://storage.yandexcloud.net
STORAGE_REGION=ru-central1
STORAGE_BUCKET=tezarium-media
STORAGE_ACCESS_KEY=<static key id>
STORAGE_SECRET_KEY=<static key secret>

# Cost backstop for the whole platform, USD per day. Set it.
GLOBAL_DAILY_SPEND_CAP_USD=10
```

(`FRONTEND_URL` is set by the compose file from `DOMAIN`.)

## 6. DNS

At your registrar (or *Cloud DNS* if the zone lives in Yandex): an **A**
record `app.tezarium.ru → <static IP>`. Caddy obtains the certificate on
first start — the record must resolve before the first deploy.

## 7. First deploy

From your machine, on `main`, with `gh` authenticated:

```bash
VM_HOST=deploy@<ip> DOMAIN=app.tezarium.ru IMAGE_REPO=cr.yandex/<registry-id>/tezarium ./deploy/deploy.sh
```

It waits for CI, checks both images are in the registry, migrates, starts
`api2`, `api`, `web`, and asserts every replica and the bundle serve this
commit. Then:

```bash
curl https://app.tezarium.ru/health        # {"ok":true,"version":"0.1.0 (…)"}
curl https://app.tezarium.ru/version.txt   # the same string, from the bundle
```

Register the first account in the browser. Done.

## When users arrive — what to bump, in order

1. **Database** — the first thing to feel load. Change the host class in
   place; add a second host for failover. Nothing in the app changes.
2. **VM** — resize (2 min downtime) or add a second VM behind a Network
   Load Balancer; the compose file runs the same two replicas per VM.
3. **Generation throughput** — `TALK_WORKER_CONCURRENCY` in `.env`
   (default 4 per replica) and the spend caps (`lib/planTier.ts`,
   `GLOBAL_DAILY_SPEND_CAP_USD`).
4. **Object Storage** — nothing; it scales itself. Set a lifecycle rule
   only if you ever want old media expired.

## Backups and the one thing to do on day one

Managed PostgreSQL takes daily backups automatically (7-day retention by
default; raise it in the cluster settings). Object Storage has versioning
— turn it on for the bucket. That is the whole backup story for the MVP.
