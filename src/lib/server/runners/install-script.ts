export const FORGE_URL = 'https://forge.arcstore.net';

export function installCommand(token: string): string {
	return `curl -fsSL ${FORGE_URL}/runner/install.sh | sudo sh -s -- ${token}`;
}

export function renderInstallScript(): string {
	return `#!/bin/sh
set -eu

FORGE_URL="${FORGE_URL}"
TOKEN="\${1:-}"
CONCURRENCY="\${2:-}"

if [ -z "$TOKEN" ]; then
  echo "Usage: install.sh <token> [concurrency]" >&2
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "The Forge runner installer must run as root" >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64|amd64) ARCH=x86_64 ;;
  aarch64|arm64) ARCH=aarch64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

mkdir -p /var/lib
TMP=$(mktemp -d /var/lib/forge-runner-install.XXXXXX)
trap 'rm -rf "$TMP"' EXIT

echo "Downloading the Forge runner for $ARCH"
curl -fsSL "$FORGE_URL/runner/download/$ARCH" -o "$TMP/forge-runner"
EXPECTED=$(curl -fsSL "$FORGE_URL/runner/sha256/$ARCH")
ACTUAL=$(sha256sum "$TMP/forge-runner" | cut -d ' ' -f 1)
if [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "Checksum mismatch for the downloaded runner" >&2
  exit 1
fi
chmod 755 "$TMP/forge-runner"

if [ -n "$CONCURRENCY" ]; then
  "$TMP/forge-runner" install --token "$TOKEN" --concurrency "$CONCURRENCY"
else
  "$TMP/forge-runner" install --token "$TOKEN"
fi
`;
}
