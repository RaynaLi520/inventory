# Ubuntu deployment

The deployment uses Nginx on port 80, the Node API on `127.0.0.1:3000`, and PostgreSQL over its local Unix socket. PostgreSQL is not exposed to the network.

From the repository root on Ubuntu:

```bash
sudo bash deploy/ubuntu/deploy.sh
```

Import the Supabase migration backup once after the first deployment:

```bash
sudo -u inventory_app env \
  PGHOST=/var/run/postgresql \
  PGDATABASE=henan_inventory \
  PGUSER=inventory_app \
  MEDIA_ROOT=/var/lib/henan-inventory/media \
  node /opt/henan-inventory/server/import-backup.js /path/to/backup.json
sudo systemctl restart inventory-api
```

Useful checks:

```bash
curl http://127.0.0.1/api/health
systemctl status inventory-api nginx postgresql --no-pager
journalctl -u inventory-api -n 100 --no-pager
```

Daily backups run around 02:30 and are retained for 14 days under `/var/backups/henan-inventory`.
