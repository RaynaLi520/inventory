#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 FULLCHAIN_CERT PRIVATE_KEY" >&2
  exit 1
fi

source_cert=$1
source_key=$2
server_name=${INVENTORY_SERVER_NAME:-inventory.justinallen.com}
tls_root=/etc/ssl/henan-inventory
server_cert="$tls_root/server.crt"
server_key="$tls_root/server.key"
public_marker="$tls_root/public-certificate-managed"
backup_root=/var/backups/henan-inventory/certificates
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir="$backup_root/$timestamp"
staged_cert=$(mktemp)
staged_key=$(mktemp)

cleanup() {
  rm -f "$staged_cert" "$staged_key"
}
trap cleanup EXIT

[[ -s "$source_cert" ]] || { echo "Certificate file is empty." >&2; exit 1; }
[[ -s "$source_key" ]] || { echo "Private key file is empty." >&2; exit 1; }

openssl x509 -in "$source_cert" -noout >/dev/null
openssl pkey -in "$source_key" -noout >/dev/null
openssl x509 -checkend 86400 -noout -in "$source_cert" >/dev/null \
  || { echo "Certificate is expired or expires within 24 hours." >&2; exit 1; }
openssl x509 -noout -ext subjectAltName -in "$source_cert" | grep -Fq "DNS:${server_name}" \
  || { echo "Certificate does not cover ${server_name}." >&2; exit 1; }

certificate_key_hash=$(openssl x509 -in "$source_cert" -pubkey -noout \
  | openssl pkey -pubin -outform DER 2>/dev/null | sha256sum | cut -d' ' -f1)
private_key_hash=$(openssl pkey -in "$source_key" -pubout -outform DER 2>/dev/null \
  | sha256sum | cut -d' ' -f1)
[[ "$certificate_key_hash" == "$private_key_hash" ]] \
  || { echo "Certificate and private key do not match." >&2; exit 1; }

certificate_count=$(grep -c -- "-----BEGIN CERTIFICATE-----" "$source_cert")
(( certificate_count >= 2 )) \
  || { echo "The certificate file must include the intermediate chain." >&2; exit 1; }

install -d -m 0750 -o root -g www-data "$tls_root"
install -d -m 0700 -o root -g root "$backup_dir"
if [[ -s "$server_cert" ]]; then install -m 0600 "$server_cert" "$backup_dir/server.crt"; fi
if [[ -s "$server_key" ]]; then install -m 0600 "$server_key" "$backup_dir/server.key"; fi

install -m 0644 "$source_cert" "$staged_cert"
install -m 0600 "$source_key" "$staged_key"
install -m 0644 -o root -g root "$staged_cert" "$server_cert"
install -m 0640 -o root -g www-data "$staged_key" "$server_key"
install -m 0644 -o root -g root /dev/null "$public_marker"

if ! nginx -t; then
  echo "Nginx rejected the new certificate; restoring the previous certificate." >&2
  if [[ -s "$backup_dir/server.crt" && -s "$backup_dir/server.key" ]]; then
    install -m 0644 -o root -g root "$backup_dir/server.crt" "$server_cert"
    install -m 0640 -o root -g www-data "$backup_dir/server.key" "$server_key"
  fi
  rm -f "$public_marker"
  exit 1
fi

systemctl reload nginx
openssl x509 -in "$server_cert" -noout -subject -issuer -dates
echo "Public certificate installed for ${server_name}. Previous certificate backup: ${backup_dir}"
