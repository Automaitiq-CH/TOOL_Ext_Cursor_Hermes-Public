#!/usr/bin/env bash
set -euo pipefail

# Publish Hermes Agent extension to VS Code Marketplace + Open VSX Registry
# Usage: ./scripts/publish.sh [--pat <token>] [--ovsx-token <token>]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

VSCE_PAT="${VSCE_PAT:-}"
OVSX_TOKEN="${OVSX_TOKEN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pat) VSCE_PAT="$2"; shift 2 ;;
    --ovsx-token) OVSX_TOKEN="$2"; shift 2 ;;
    --dry-run) echo "[dry-run] Would publish to VS Code Marketplace + Open VSX"; exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$VSCE_PAT" ]]; then
  echo "ERROR: VSCE_PAT is required."
  echo "  Create one at: https://dev.azure.com → Personal Access Tokens"
  echo "  Scopes needed: Marketplace > Manage"
  echo "  Then: export VSCE_PAT=<your-token>"
  exit 1
fi

echo "==> Building VSIX..."
npx vsce package

echo "==> Publishing to VS Code Marketplace..."
export VSCE_PAT
npx vsce publish
echo "==> VS Code Marketplace: published!"

if [[ -n "$OVSX_TOKEN" ]]; then
  echo "==> Publishing to Open VSX Registry (for Cursor/VSCodium)..."
  npx ovsx publish -p "$OVSX_TOKEN"
  echo "==> Open VSX: published!"
else
  echo "SKIP: Open VSX (set OVSX_TOKEN to publish to Cursor/VSCodium registry)"
  echo "  Get token at: https://open-vsx.org/user-settings/tokens"
fi

echo ""
echo "DONE. Extension URLs:"
echo "  VS Code: https://marketplace.visualstudio.com/items?itemName=automaitiq.hermes-agent"
echo "  Open VSX: https://open-vsx.org/extension/automaitiq/hermes-agent"
