#!/usr/bin/env bash
set -euo pipefail

tls_root=/etc/ssl/henan-inventory
server_ip=${INVENTORY_SERVER_IP:-172.16.100.198}
server_name=${INVENTORY_SERVER_NAME:-inventory.justinallen.com}
ca_key="$tls_root/ca.key"
ca_cert="$tls_root/ca.crt"
server_key="$tls_root/server.key"
server_cert="$tls_root/server.crt"
public_marker="$tls_root/public-certificate-managed"

umask 077
install -d -m 0750 -o root -g www-data "$tls_root"

if [[ -e "$public_marker" ]]; then
  if [[ -s "$server_cert" && -s "$server_key" ]] \
    && openssl x509 -checkend 86400 -noout -in "$server_cert" \
    && openssl x509 -noout -ext subjectAltName -in "$server_cert" | grep -Fq "DNS:${server_name}"; then
    exit 0
  fi
  echo "The managed public certificate is missing, invalid, or expires within 24 hours. Install its renewed certificate instead of generating an internal certificate." >&2
  exit 1
fi

if [[ ! -s "$ca_key" || ! -s "$ca_cert" ]]; then
  openssl genrsa -out "$ca_key" 4096
  openssl req -x509 -new -sha256 -days 3650 \
    -key "$ca_key" -out "$ca_cert" \
    -subj "/C=CN/O=Justin Allen/OU=Inventory/CN=JA Inventory Internal CA" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "subjectKeyIdentifier=hash"
fi

if [[ -s "$server_cert" ]] && openssl x509 -checkend 2592000 -noout -in "$server_cert" \
  && openssl x509 -noout -ext subjectAltName -in "$server_cert" | grep -Fq "DNS:${server_name}"; then
  exit 0
fi

config_file=$(mktemp)
csr_file=$(mktemp)
key_file=$(mktemp)
cert_file=$(mktemp)
trap 'rm -f "$config_file" "$csr_file" "$key_file" "$cert_file"' EXIT

cat >"$config_file" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:${server_name},IP:${server_ip}
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
EOF

openssl genrsa -out "$key_file" 3072
openssl req -new -sha256 -key "$key_file" -out "$csr_file" \
  -subj "/C=CN/O=Justin Allen/OU=Inventory/CN=${server_name}"
openssl x509 -req -sha256 -days 397 -in "$csr_file" \
  -CA "$ca_cert" -CAkey "$ca_key" -CAcreateserial \
  -extfile "$config_file" -out "$cert_file"

install -m 0640 -o root -g www-data "$key_file" "$server_key"
install -m 0644 -o root -g root "$cert_file" "$server_cert"
chmod 0600 "$ca_key"
chmod 0644 "$ca_cert"

if systemctl is-active --quiet nginx; then
  nginx -t
  systemctl reload nginx
fi
