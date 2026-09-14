#!/usr/bin/env bash
# deploy/backup-db.sh — nightly dump of the local-db Postgres to Object
# Storage. Only needed with COMPOSE_PROFILES=local-db (a managed database
# backs itself up). Install on the VM:
#   crontab -e  →  15 2 * * * /opt/tezarium/backup-db.sh >> /opt/tezarium/backup.log 2>&1
# Needs the AWS CLI (`sudo apt-get install -y awscli`) configured once with
# the same static key the app uses:  aws configure  (region ru-central1).
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
stamp="$(date -u +%Y-%m-%d)"
file="tezarium-${stamp}.sql.gz"
docker exec tezarium-db pg_dump -U tezarium -d tezarium --no-owner | gzip > "/tmp/${file}"
aws --endpoint-url "${STORAGE_ENDPOINT}" s3 cp "/tmp/${file}" "s3://${STORAGE_BUCKET}/backups/${file}"
rm -f "/tmp/${file}"
# Keep 30 days locally-listed; older objects can be expired by a bucket lifecycle rule.
echo "backup ok ${file}"
