# Ubuntu deployment

The deployment uses Nginx with HTTPS on port 443, the Node API on `127.0.0.1:3000`, and PostgreSQL over its local Unix socket. PostgreSQL is not exposed to the network. The platform uses its own registration, login, roles, sessions, and password-reset workflow.

From the repository root on Ubuntu:

```bash
sudo bash deploy/ubuntu/deploy.sh
```

Create or update the first administrator without putting the password in shell history:

```bash
read -rsp "Initial admin password: " INITIAL_ADMIN_PASSWORD; echo
sudo -u inventory_app env \
  PGHOST=/var/run/postgresql \
  PGDATABASE=henan_inventory \
  PGUSER=inventory_app \
  INITIAL_ADMIN_USERNAME=rayna.li \
  INITIAL_ADMIN_EMAIL=rayna.li@justinallen.com \
  INITIAL_ADMIN_DISPLAY_NAME="Rayna Li" \
  INITIAL_ADMIN_PASSWORD="$INITIAL_ADMIN_PASSWORD" \
  node /opt/henan-inventory/server/create-admin.js
unset INITIAL_ADMIN_PASSWORD
```

Newly registered users remain pending until an administrator approves them and selects a role. Administrators can disable accounts and issue one-time temporary passwords from the account panel.

Useful checks:

```bash
curl http://127.0.0.1:3000/api/health
systemctl status inventory-api nginx postgresql --no-pager
journalctl -u inventory-api -n 100 --no-pager
systemctl status inventory-coz-sync.timer --no-pager
journalctl -u inventory-coz-sync -n 100 --no-pager
```

The Ubuntu server calls the CoZ Forguncy inventory API directly every 60 seconds. The synchronization does not require a browser extension or an always-on employee computer. Each response must be complete before PostgreSQL is updated; failed or partial responses leave the previous inventory unchanged.

Daily backups run around 02:30 and are retained for 14 days under `/var/backups/henan-inventory`.

The current certificate generator includes both `inventory.justinallen.com` and the private IP, but it is signed by the internal CA. To avoid manual certificate installation on every colleague's device, configure internal DNS for `inventory.justinallen.com` and replace it with a publicly trusted certificate obtained using DNS-01 validation.

Install a publicly trusted full-chain certificate without committing certificate files to the repository:

```bash
sudo /usr/local/sbin/henan-inventory-install-certificate /path/to/fullchain.crt /path/to/private.key
```

Once installed, users must open `https://inventory.justinallen.com`; a certificate issued only for the DNS name cannot validate direct access to `https://172.16.100.198`. The installer validates the hostname, expiry, chain, and matching private key, backs up the previous certificate, and marks the public certificate so future deployments cannot replace it with the internal CA certificate.
