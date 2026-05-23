#!/usr/bin/env bash
# Build a signed + notarized macOS DMG of Mili DB Explorer.
#
# Reads APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID from .env at repo root.
# The "Developer ID Application: Mili Software Inc." cert must already be in
# the login keychain.
#
# Output: release/Mili-DB-Explorer-<version>-<arch>.dmg (arm64 + x64)

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

if [[ -z "${APPLE_ID:-}" || -z "${APPLE_PASSWORD:-}" || -z "${APPLE_TEAM_ID:-}" ]]; then
  echo "ERROR: APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID must be set in .env" >&2
  exit 1
fi

# Verify cert is present (don't error if missing — electron-builder will give a
# clearer message — but warn early so users notice).
if ! security find-identity -v -p codesigning | grep -q "Developer ID Application: Mili Software Inc."; then
  echo "WARN: 'Developer ID Application: Mili Software Inc.' not found in keychain." >&2
  echo "      Run 'security find-identity -v -p codesigning' to verify." >&2
fi

# electron-builder's dmg-builder shells out to `python` (Python 2 era leftover)
# and imports pyexpat. macOS 12+ ships no `python` at all, and Homebrew's
# python@3.14 has a known broken pyexpat (missing libexpat symbols on macOS).
# Prefer a working interpreter: 3.12 → 3.11 → 3.10 → 3.13 → 3.9 → python3.
PY_PICK=""
for candidate in python3.12 python3.11 python3.10 python3.13 python3.9 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    # Quick smoke test: pyexpat must import.
    if "$candidate" -c "import pyexpat" >/dev/null 2>&1; then
      PY_PICK="$(command -v "$candidate")"
      break
    fi
  fi
done

if [[ -z "$PY_PICK" ]]; then
  echo "ERROR: no working python with pyexpat found." >&2
  echo "  Try: brew install python@3.12" >&2
  exit 1
fi

SHIM_DIR="$(pwd)/.build-bin"
mkdir -p "$SHIM_DIR"
cat > "$SHIM_DIR/python" <<EOF
#!/bin/sh
exec "$PY_PICK" "\$@"
EOF
chmod +x "$SHIM_DIR/python"
export PATH="$SHIM_DIR:$PATH"
echo "[build-mac] shimmed python → $PY_PICK"

# Make sure the notarize hook's dependency is installed.
if ! node -e "require.resolve('@electron/notarize')" >/dev/null 2>&1; then
  echo "[build-mac] installing @electron/notarize…"
  npm install --save-dev --no-audit --no-fund @electron/notarize >/dev/null
fi

if [[ "${SKIP_CLEAN:-0}" == "1" ]]; then
  echo "[build-mac] SKIP_CLEAN=1 — reusing existing dist/ and release/ outputs"
else
  echo "[build-mac] cleaning previous output…"
  rm -rf release dist dist-electron
fi

if [[ ! -d dist || ! -d dist-electron ]]; then
  echo "[build-mac] building renderer + main…"
  npm run build
fi

echo "[build-mac] running electron-builder (sign + notarize + dmg, arm64 + x64)…"
npx electron-builder --mac --arm64 --x64 --publish never

echo
echo "[build-mac] artifacts:"
ls -lh release/*.dmg 2>/dev/null || echo "  (none — check electron-builder output)"

echo
echo "[build-mac] verifying signatures…"
for app in release/mac*/Mili\ DB\ Explorer.app; do
  if [[ -d "$app" ]]; then
    echo "  $app"
    codesign --verify --deep --strict --verbose=2 "$app" 2>&1 | sed 's/^/    /'
    spctl --assess --type execute --verbose=2 "$app" 2>&1 | sed 's/^/    /' || true
  fi
done
