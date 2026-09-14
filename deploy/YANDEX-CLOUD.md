# Tezarium on Yandex Cloud — MVP setup through the console

Smallest resources that run the product properly, each chosen so it
scales later by changing a setting, not by re-architecting. Everything
is done in the web console (console.yandex.cloud). A terminal is needed
in exactly two places, and neither is the Yandex CLI: **on the VM** to
install Docker (step 5c), and **on your Mac** to run `deploy.sh` (step 7).

You will create, in this order: a service account → a container registry
→ a database → a storage bucket → a VM → a DNS record. Keep a text file
open — you will collect about ten values along the way.

Prices change; check *Pricing → Calculator* before creating. Order of
magnitude: the presets below total a few thousand ₽/month, most of it
the database.

---

## 0. Before you start

- A Yandex Cloud account with billing enabled and one **folder** (the
  default one is fine; do everything inside it).
- A domain you control (say `app.tezarium.ru`).
- Your DeepSeek API key.
- The `gh` CLI on your Mac is already authenticated (it is — the repo was
  created with it).

## 1. Service account — one, with two roles and two keys

*Console → Identity and Access Management → Service accounts → Create
service account.*

- Name: `tezarium-ops`
- Roles (click *Add role*, twice):
  - `container-registry.images.pusher` — lets CI push images
  - `storage.editor` — lets the app read/write slide images

Open the account you just created. Two keys:

**a) Authorized key** — *Create new key → Create authorized key* →
Encryption algorithm RSA_2048 → Create. The console offers a download —
**save it as `tezarium-ops-key.json`**. This JSON is used by GitHub (step 2)
and by the VM (step 5c). It is shown once.

**b) Static access key** — *Create new key → Create static access key* →
Create. Copy **Key ID** and **Secret key** into your text file. Also shown
once.

Collected so far: `tezarium-ops-key.json`, `STORAGE_ACCESS_KEY`
(the key id), `STORAGE_SECRET_KEY` (the secret).

## 2. Container Registry + GitHub secrets

*Console → Container Registry → Create registry.* Name `tezarium`. Open
it and copy its **ID** (looks like `crp1abc23def…`). Repositories
(`tezarium-api`, `tezarium-web`) appear automatically on first push.

Now GitHub, in the browser: *github.com/daniesmurts/Presentation-Maker →
Settings → Secrets and variables → Actions → New repository secret*, four
times:

| Name | Value |
|---|---|
| `REGISTRY` | `cr.yandex` |
| `IMAGE_REPO` | `cr.yandex/<registry ID>/tezarium` |
| `REGISTRY_USER` | `json_key` |
| `REGISTRY_PASSWORD` | open `tezarium-ops-key.json` in a text editor and paste its **entire contents** |

From the next push to `main`, CI pushes both images. Check: *Container
Registry → tezarium → Repositories* shows two entries after the next CI
run (a push to main, or *Actions → CI → Re-run all jobs* on the latest run).

Collected: `IMAGE_REPO`.

## 3. The database — two options

**Cost first.** The console pre-fills the cluster form with TWO hosts;
each is billed. For an MVP delete the second host — that alone halves the
quote. Then choose:

- **Option B — Postgres on the VM (recommended until you have paying
  users).** No cluster at all; the VM runs Postgres as a container next
  to the app, exactly how the parent product runs. Costs nothing beyond
  the VM. You own backups (`deploy/backup-db.sh` dumps nightly to the
  bucket) and there is no failover. Skip the rest of this step; in step
  5d set `COMPOSE_PROFILES=local-db`, `DB_PASSWORD`, and
  `DATABASE_URL=postgresql://tezarium:<DB_PASSWORD>@db:5432/tezarium`,
  and leave `DATABASE_SSL_CA` out. Moving to Managed later: create the
  cluster, `pg_dump` from the container, `psql` into the cluster, change
  `DATABASE_URL`, redeploy.
- **Option A — Managed PostgreSQL, one host, smallest class.** Daily
  backups and failover-when-you-add-a-host, for a monthly fee. Settings
  below; use **`b2.nano`** (2 vCPU 5%, 2 GB) to start — Postgres idles
  without users — and bump to `b2.medium` / `s3-*` in place later.

### Option A settings

*Console → Managed Service for PostgreSQL → Create cluster.*

| Section | Setting | MVP value | Bump later |
|---|---|---|---|
| Basic | Name | `tezarium` | — |
| | Environment | PRODUCTION | — |
| | Version | 16 | — |
| Host class | Platform | **Intel Cascade Lake** (burstable classes exist only on Broadwell/Cascade Lake — Ice Lake greys the option out) | — |
| | Type | **burstable**, `b2.nano` (2 vCPU 5%, 2 GB) | `b2.medium`, then *standard* `s3-c2-m8` or larger — edited in place, a few minutes of restart |
| Storage | Type | network-ssd | — |
| | Size | 20 GB | increase in place, no downtime |
| Database | Name | `tezarium` | — |
| | Username | `tezarium` | — |
| | Password | generate a long one, save it | — |
| Network | Cloud network / subnet | the default network, subnet in **ru-central1-a** (remember the zone — the VM goes in the same one) | — |
| | Public access | **off** | — |
| | Security groups | leave default for now; step 5b returns here | — |
| Hosts | Availability zone | **exactly 1 host** (delete the pre-filled second one), same zone as the VM | *Add host* in another zone → automatic failover, nothing changes in the app |
| Additional | Backups | leave on (daily, 7 days retained) | raise retention |

Create. When the cluster is *Alive*, open it → *Hosts* → copy the host's
**FQDN** (ends in `.mdb.yandexcloud.net`).

The app connects on port **6432** (the cluster's built-in connection
pooler, not 5432):

```
postgresql://tezarium:PASSWORD@<host-FQDN>:6432/tezarium
```

Yandex signs the database with its own certificate authority. Download
the CA file in your browser — open this URL and save it as `root.crt`:

https://storage.yandexcloud.net/cloud-certs/CA.pem

Collected: `DATABASE_URL`, `root.crt`.

## 4. Object Storage — one private bucket

*Console → Object Storage → Create bucket.*

- Name: `tezarium-media` (names are global; add a suffix if taken)
- Max size: leave 0 (unlimited)
- Object read access: **Restricted** · Object listing: Restricted
- Storage class: Standard
- After creating: bucket → *Settings → Versioning → Enabled* (that is the
  media backup story).

Collected: `STORAGE_BUCKET`.

## 5. The VM — MVP 2 vCPU / 4 GB; later resize or add a second

### 5a. Reserve a static IP

*Console → Virtual Private Cloud → IP addresses → Reserve address* →
zone ru-central1-a. Copy it. (Reserved so it survives VM recreation and
the DNS record never changes.)

### 5b. Security group

*Virtual Private Cloud → Security groups → Create*, name `tezarium-vm`,
in the default network. Inbound rules:

| Port | Source | Why |
|---|---|---|
| 22 | your IP (or 0.0.0.0/0 to start, tighten later) | SSH |
| 80 | 0.0.0.0/0 | Caddy's certificate challenge + redirect |
| 443 | 0.0.0.0/0 | HTTPS |

Outbound: allow all.

Then go back to the **database** cluster → *Edit* → Security groups → add
a rule (or a second group) allowing inbound **6432** from the
`tezarium-vm` security group. Without this the VM cannot reach the
database.

### 5c. Create the VM

*Console → Compute Cloud → Virtual machines → Create VM.*

| Section | Setting | MVP value | Bump later |
|---|---|---|---|
| Image | | Ubuntu 24.04 LTS | — |
| Zone | | ru-central1-a | — |
| Disk | | network-ssd, 30 GB | grow in place |
| Computing resources | Platform | Intel Ice Lake | — |
| | vCPU | **2**, core fraction **50%** | 100%, more vCPU/RAM: *Stop → Edit → Start* (~2 min downtime). Or create a second identical VM and put both behind *Network Load Balancer* — the app already runs as stateless replicas |
| | RAM | 4 GB | |
| Network | Subnet | the same one as the database | — |
| | Public address | *List* → pick the reserved IP | — |
| | Security groups | `tezarium-vm` | — |
| Access | Login | `deploy` | — |
| | SSH key | paste your public key (`cat ~/.ssh/id_ed25519.pub` on your Mac) | — |

Create. Now the first terminal moment — on your Mac:

```bash
ssh deploy@<static IP>
```

On the VM, paste these blocks one at a time:

```bash
# Docker + compose plugin (official Docker repository)
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and back in (`exit`, then `ssh` again) so the docker group applies. Then:

```bash
sudo mkdir -p /opt/tezarium && sudo chown $USER /opt/tezarium
mkdir -p /opt/tezarium/certs /opt/tezarium/uploads
```

From your **Mac**, copy the two files up (the CA and the registry key):

```bash
scp root.crt deploy@<static IP>:/opt/tezarium/certs/root.crt
scp tezarium-ops-key.json deploy@<static IP>:/home/deploy/tezarium-ops-key.json
```

Back **on the VM**, log Docker into the registry (once) and remove the key:

```bash
cat ~/tezarium-ops-key.json | docker login cr.yandex --username json_key --password-stdin && rm ~/tezarium-ops-key.json
```

### 5d. The environment file

On the VM, `nano /opt/tezarium/.env` and fill in from your text file:

```
NODE_ENV=production
PORT=3000
DOMAIN=app.tezarium.ru
IMAGE_REPO=cr.yandex/<registry ID>/tezarium

# Option B (Postgres on the VM):
COMPOSE_PROFILES=local-db
DB_PASSWORD=<a long random string>
DATABASE_URL=postgresql://tezarium:<DB_PASSWORD>@db:5432/tezarium
# Option A (Managed) instead:
# DATABASE_URL=postgresql://tezarium:PASSWORD@<host-FQDN>:6432/tezarium
# DATABASE_SSL_CA=/app/certs/root.crt
DB_POOL_MAX=10

JWT_SECRET=<a long random string — e.g. 64 random characters>
DEEPSEEK_API_KEY=<your key>

STORAGE_ENDPOINT=https://storage.yandexcloud.net
STORAGE_REGION=ru-central1
STORAGE_BUCKET=tezarium-media
STORAGE_ACCESS_KEY=<static key id>
STORAGE_SECRET_KEY=<static key secret>

# Platform-wide cost backstop, USD per day. Set it.
GLOBAL_DAILY_SPEND_CAP_USD=10
```

## 6. DNS

Where your domain is managed (your registrar, or *Console → Cloud DNS* if
you moved the zone there): add an **A** record

```
app.tezarium.ru  →  <static IP>
```

Wait until it resolves (a few minutes; check by opening
`http://<static IP>` — nothing runs yet, but the name must point there
before the first deploy, because Caddy requests the certificate on start).

## 7. First deploy — from your Mac

Second and last terminal moment. In the repo, on `main`:

```bash
VM_HOST=deploy@<static IP> DOMAIN=app.tezarium.ru IMAGE_REPO=cr.yandex/<registry ID>/tezarium ./deploy/deploy.sh
```

It waits for CI on the current commit, checks both images exist in the
registry, migrates the database with that image, starts `api2` → `api` →
`web` one at a time, and asserts every replica and the served bundle carry
this commit. Then in the browser:

- `https://app.tezarium.ru/health` → `{"ok":true,"version":"0.1.0 (…)"}`
- `https://app.tezarium.ru/version.txt` → the same string
- `https://app.tezarium.ru` → register the first account.

## When users arrive — bump in this order, all in the console

1. **Database** (*Managed PostgreSQL → cluster → Edit*): bigger host
   class; then *Add host* for failover. No app change.
2. **VM** (*Compute → VM → Stop → Edit → Start*): more vCPU/RAM. Or a
   second VM + *Network Load Balancer* pointing at both on 80/443.
3. **Generation throughput**: in `/opt/tezarium/.env`,
   `TALK_WORKER_CONCURRENCY` (default 4 per replica) and the spend caps
   (`GLOBAL_DAILY_SPEND_CAP_USD`; per-plan caps live in `lib/planTier.ts`).
   Re-run `deploy.sh` to apply.
4. **Object Storage**: nothing to do.

## Backups

Option A: Yandex backs the cluster up daily (*cluster → Backups*).
Option B: on the VM, `sudo apt-get install -y awscli`, `aws configure`
with the static key (region `ru-central1`), then `crontab -e` and add
`15 2 * * * /opt/tezarium/backup-db.sh >> /opt/tezarium/backup.log 2>&1`
— a nightly dump lands in the bucket under `backups/`. Bucket versioning
(step 4) covers media. Nothing else holds state.
