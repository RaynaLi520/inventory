#!/usr/bin/env bash
set -euo pipefail

backup_root=/var/backups/henan-inventory
media_root=/var/lib/henan-inventory/media
stamp=$(date +%Y%m%d-%H%M%S)
target="${backup_root}/${stamp}"

umask 077
mkdir -p "$target"
pg_dump --format=custom --file="$target/database.dump" henan_inventory
tar -C "$media_root" -czf "$target/media.tar.gz" .
find "$backup_root" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf -- {} +
