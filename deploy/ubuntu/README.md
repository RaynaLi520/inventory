# Ubuntu deployment

The deployment uses Nginx with HTTPS on port 443, the Node API on `127.0.0.1:3000`, and PostgreSQL over its local Unix socket. PostgreSQL is not exposed to the network. HTTP only redirects to HTTPS, and the website/API require Nginx Basic Authentication.

Create the website account before the first secured deployment. Do not commit the password file:

```bash
sudo htpasswd -cB /etc/nginx/henan-inventory.htpasswd rayna
sudo chown root:www-data /etc/nginx/henan-inventory.htpasswd
sudo chmod 0640 /etc/nginx/henan-inventory.htpasswd
```

Then, from the repository root on Ubuntu:

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

The internal CA certificate is `/etc/ssl/henan-inventory/ca.crt`. Install this public certificate in each authorized device's trusted root store. Never copy `ca.key` or `server.key` from the VM. The server certificate is checked monthly and renewed automatically before expiry.

On Windows, install the public CA for the current user after verifying its SHA-256 fingerprint with the administrator:

```powershell
certutil -user -addstore Root .\ja-inventory-ca.crt
```

Change the website password at any time with `sudo htpasswd -B /etc/nginx/henan-inventory.htpasswd rayna`. The stored value is a bcrypt hash, not the plain-text password.
