#!/bin/sh
# Create the stable self-signed Mac signing certificate and store it as GitHub secrets.
# Rerunning replaces the identity, so Keychain asks once more after the next update.
set -eu

repository="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
work="$(mktemp -d /private/tmp/sill-signing-XXXXXX)"
trap 'rm -rf "$work"' EXIT

cat > "$work/openssl.cnf" <<'EOF'
[req]
distinguished_name = name
x509_extensions = codesign
prompt = no
[name]
CN = Sill Self-Signed
[codesign]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
EOF

openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
	-config "$work/openssl.cnf" -keyout "$work/key.pem" -out "$work/cert.pem" 2>/dev/null
legacy=""
openssl version | grep -q '^OpenSSL 3' && legacy="-legacy"
password="$(uuidgen)"
openssl pkcs12 -export $legacy -inkey "$work/key.pem" -in "$work/cert.pem" \
	-name "Sill Self-Signed" -passout "pass:$password" -out "$work/sill.p12"

base64 -i "$work/sill.p12" | gh secret set SILL_MAC_SIGNING_P12 --repo "$repository"
printf '%s' "$password" | gh secret set SILL_MAC_SIGNING_P12_PASSWORD --repo "$repository"
echo "Stored SILL_MAC_SIGNING_P12 and SILL_MAC_SIGNING_P12_PASSWORD in $repository"
