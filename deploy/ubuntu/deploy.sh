#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi

app_source=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
app_root=/opt/henan-inventory
data_root=/var/lib/henan-inventory
backup_root=/var/backups/henan-inventory

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx postgresql postgresql-contrib nodejs npm rsync

if ! id inventory_app >/dev/null 2>&1; then
  useradd --system --home-dir "$data_root" --create-home --shell /usr/sbin/nologin inventory_app
fi

if ! sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='inventory_app'" | grep -q 1; then
  sudo -u postgres createuser inventory_app
fi
if ! sudo -u postgres psql -tAc "select 1 from pg_database where datname='henan_inventory'" | grep -q 1; then
  sudo -u postgres createdb --owner=inventory_app henan_inventory
fi

mkdir -p "$app_root" "$data_root/media" "$backup_root"
if [[ "$app_source" != "$app_root" ]]; then
  rsync -a --delete \
    --exclude='.git/' --exclude='.vercel/' --exclude='node_modules/' \
    "$app_source/" "$app_root/"
fi
cd "$app_root"
npm ci --omit=dev

chown -R root:root "$app_root"
chown -R inventory_app:www-data "$data_root"
chown -R inventory_app:inventory_app "$backup_root"
chmod 0750 "$data_root"
chmod 2750 "$data_root/media"
find "$app_root" -type d -exec chmod 0755 {} +
find "$app_root" -type f -exec chmod 0644 {} +

sudo -u inventory_app psql --dbname=henan_inventory --file="$app_root/server/schema.sql"

install -m 0644 "$app_root/deploy/ubuntu/inventory-api.service" /etc/systemd/system/inventory-api.service
install -m 0644 "$app_root/deploy/ubuntu/inventory-backup.service" /etc/systemd/system/inventory-backup.service
install -m 0644 "$app_root/deploy/ubuntu/inventory-backup.timer" /etc/systemd/system/inventory-backup.timer
install -m 0755 "$app_root/deploy/ubuntu/backup.sh" /usr/local/sbin/henan-inventory-backup
install -m 0644 "$app_root/deploy/ubuntu/nginx.conf" /etc/nginx/sites-available/henan-inventory
ln -sfn /etc/nginx/sites-available/henan-inventory /etc/nginx/sites-enabled/henan-inventory
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl daemon-reload
systemctl enable --now postgresql inventory-api.service inventory-backup.timer nginx
systemctl restart inventory-api.service nginx

echo "Deployment complete. Import a Supabase backup when required:"
echo "sudo -u inventory_app env PGHOST=/var/run/postgresql PGDATABASE=henan_inventory PGUSER=inventory_app MEDIA_ROOT=$data_root/media node $app_root/server/import-backup.js /path/to/backup.json"
