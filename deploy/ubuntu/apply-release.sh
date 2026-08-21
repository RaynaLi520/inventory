#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi

release_root=${1:-/tmp/henan-inventory-release}
app_root=/opt/henan-inventory

required_files=(
  assets/inventory.js
  assets/inventory.css
  index.html
  server/coz-sync-core.js
  server/coz-records-core.js
  server/coz-records-sync.js
  server/schema.sql
  server/index.js
  deploy/ubuntu/inventory-coz-records-sync.service
  deploy/ubuntu/inventory-coz-records-sync.timer
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$release_root/$file" ]]; then
    echo "Missing release file: $release_root/$file" >&2
    exit 1
  fi
done

node --check "$release_root/assets/inventory.js"
node --input-type=module --check < "$release_root/server/coz-sync-core.js"
node --input-type=module --check < "$release_root/server/coz-records-core.js"
node --input-type=module --check < "$release_root/server/coz-records-sync.js"
node --input-type=module --check < "$release_root/server/index.js"

install -m 0644 "$release_root/assets/inventory.js" "$app_root/assets/inventory.js"
install -m 0644 "$release_root/assets/inventory.css" "$app_root/assets/inventory.css"
install -m 0644 "$release_root/index.html" "$app_root/index.html"
install -m 0644 "$release_root/server/coz-sync-core.js" "$app_root/server/coz-sync-core.js"
install -m 0644 "$release_root/server/coz-records-core.js" "$app_root/server/coz-records-core.js"
install -m 0644 "$release_root/server/coz-records-sync.js" "$app_root/server/coz-records-sync.js"
install -m 0644 "$release_root/server/index.js" "$app_root/server/index.js"
install -m 0644 "$release_root/deploy/ubuntu/inventory-coz-records-sync.service" /etc/systemd/system/inventory-coz-records-sync.service
install -m 0644 "$release_root/deploy/ubuntu/inventory-coz-records-sync.timer" /etc/systemd/system/inventory-coz-records-sync.timer
install -m 0644 "$release_root/server/schema.sql" "$app_root/server/schema.sql"
sudo -u inventory_app psql --dbname=henan_inventory --file="$app_root/server/schema.sql"

systemctl daemon-reload
systemctl restart inventory-api.service
systemctl start inventory-coz-sync.service
if [[ -f /etc/henan-inventory/coz-purchase-records-request.json && -f /etc/henan-inventory/coz-inbound-records-request.json ]]; then
  systemctl enable --now inventory-coz-records-sync.timer
  systemctl start inventory-coz-records-sync.service
fi
systemctl is-active --quiet inventory-api.service
systemctl is-active --quiet inventory-coz-sync.timer
curl --fail --silent --show-error http://127.0.0.1:3000/api/health >/dev/null

echo "Inventory release applied successfully."
