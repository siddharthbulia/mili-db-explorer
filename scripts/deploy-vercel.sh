#!/usr/bin/env bash
# Deploy site/ (landing page + DMGs) to Vercel as siddharth@getmili.ai.
#
# 1. Copies any DMG in release/ into site/downloads/
# 2. Writes site/downloads/manifest.json so the landing page links it
# 3. Runs `vercel --prod` against the project named in VERCEL_PROJECT_NAME
#
# First run is interactive (vercel login + project link). After that it
# remembers everything in .vercel/.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

PROJECT_NAME="${VERCEL_PROJECT_NAME:-mili-db-explorer}"
VERCEL_SCOPE="${VERCEL_SCOPE:-sb0210s-projects}"   # sb0210 personal scope
SITE_DIR="site"
DL_DIR="$SITE_DIR/downloads"
# DMGs > 100 MB don't fit on Vercel Hobby. We host them on GitHub Releases.
GH_REPO="${GH_REPO:-siddharthbulia/mili-db-explorer}"

mkdir -p "$DL_DIR"

# Pull version from package.json.
VERSION=$(node -p "require('./package.json').version")

# Copy fresh DMGs into the site bundle.
shopt -s nullglob
DMGS=(release/*.dmg)
shopt -u nullglob

# DMGs live on GitHub Releases (>100 MB exceeds Vercel Hobby's per-file limit).
# We don't copy them into the Vercel bundle. We pick the source of truth in
# this order:
#   1. release/*.dmg     (fresh local build)
#   2. site/downloads/   (left over from earlier builds — used for sizing only)
#   3. fail
SRC_DMGS=()
if [[ ${#DMGS[@]} -gt 0 ]]; then
  SRC_DMGS=("${DMGS[@]}")
  echo "[deploy] using fresh DMGs in release/ for manifest metadata:"
else
  shopt -s nullglob
  EXISTING=("$DL_DIR"/*.dmg)
  shopt -u nullglob
  if [[ ${#EXISTING[@]} -eq 0 ]]; then
    echo "ERROR: No DMGs in release/ or site/downloads/. Run 'npm run release:mac' first." >&2
    exit 1
  fi
  SRC_DMGS=("${EXISTING[@]}")
  echo "[deploy] no fresh DMGs in release/ — using existing artifacts for sizing:"
fi
printf '  %s\n' "${SRC_DMGS[@]}"

# Make sure Vercel won't try to ship the DMGs.
find "$DL_DIR" -maxdepth 1 -name '*.dmg' -delete 2>/dev/null || true

# Build manifest.json with GitHub Releases URLs. Bash array → stdin → Node.
GH_REPO="$GH_REPO" printf '%s\n' "${SRC_DMGS[@]}" | node -e '
const repo = process.env.GH_REPO || "siddharthbulia/mili-db-explorer";
const pkg = require(process.cwd() + "/package.json");
const fs = require("fs");
const lines = require("fs").readFileSync(0, "utf8").split("\n").filter(Boolean);
const assets = lines.map((p) => {
  const stat = fs.statSync(p);
  const filename = require("path").basename(p);
  const m = filename.match(/-(arm64|x64)\.dmg$/);
  return {
    filename,
    // GitHub redirects /releases/latest/download/<asset> to the most recent
    // release containing that asset. We use the version-pinned URL so the
    // landing page always lines up with the manifest version.
    url: `https://github.com/${repo}/releases/download/v${pkg.version}/${filename}`,
    arch: m ? m[1] : "unknown",
    sizeBytes: stat.size,
    sizeMB: (stat.size / (1024 * 1024)).toFixed(1),
  };
});
process.stdout.write(JSON.stringify({
  version: pkg.version,
  productName: (pkg.build && pkg.build.productName) || pkg.name,
  generatedAt: new Date().toISOString(),
  source: `https://github.com/${repo}/releases/tag/v${pkg.version}`,
  assets,
}, null, 2));
' > "$DL_DIR/manifest.json"

echo "[deploy] manifest:"
cat "$DL_DIR/manifest.json" | sed 's/^/  /'

# Make sure Vercel CLI is available.
if ! command -v vercel >/dev/null 2>&1; then
  echo "[deploy] installing vercel CLI globally…"
  npm install -g vercel
fi

# Ensure we're logged in as the expected account. If not, prompt the user.
WHO=$(vercel whoami 2>/dev/null || true)
if [[ -z "$WHO" ]]; then
  echo "[deploy] not logged in. Running 'vercel login' (use siddharth@getmili.ai)…"
  vercel login
  WHO=$(vercel whoami 2>/dev/null || true)
fi
echo "[deploy] logged in as: $WHO"

# Link project on first deploy. The --yes flag accepts defaults when possible.
LINK_FLAGS=()
if [[ ! -d "$SITE_DIR/.vercel" ]]; then
  echo "[deploy] linking Vercel project '$PROJECT_NAME' on scope '$VERCEL_SCOPE' (first run is interactive)…"
  LINK_FLAGS+=(--name "$PROJECT_NAME")
fi

cd "$SITE_DIR"
vercel pull --yes --environment=production --scope "$VERCEL_SCOPE" 2>/dev/null || true
# Use "+" subscript so an empty LINK_FLAGS doesn't trip set -u.
# Capture the deployment URL so we can re-alias the canonical hostname.
DEPLOY_OUT=$(vercel deploy --prod --yes --scope "$VERCEL_SCOPE" ${LINK_FLAGS[@]+"${LINK_FLAGS[@]}"} 2>&1 | tee /dev/stderr)
NEW_URL=$(echo "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9-]+\.vercel\.app' | head -1)
CANONICAL="${PROJECT_NAME}-${VERCEL_SCOPE}.vercel.app"
if [[ -n "$NEW_URL" ]]; then
  echo "[deploy] re-pointing alias $CANONICAL → $NEW_URL"
  # Aliasing may fail on free Vercel accounts that don't allow arbitrary alias
  # creation, or on the very first deploy where the canonical name isn't owned
  # yet. The base deployment URL still works in those cases, so non-fatal.
  if ! vercel alias set "${NEW_URL#https://}" "$CANONICAL" --scope "$VERCEL_SCOPE" 2>&1 | tail -3; then
    echo "[deploy] alias creation failed (non-fatal). Using the auto-generated deployment URL: $NEW_URL"
  fi
fi

# After the first deploy: ensure the project has the right name and that
# SSO/password protection is OFF (otherwise downloads return 401). Idempotent.
if [[ -f .vercel/project.json ]]; then
  PROJECT_ID=$(node -p "require('./.vercel/project.json').projectId")
  TEAM_ID=$(node -p "require('./.vercel/project.json').orgId")
  TOKEN_FILE="$HOME/Library/Application Support/com.vercel.cli/auth.json"
  if [[ -f "$TOKEN_FILE" ]]; then
    TOKEN=$(node -p "require('$TOKEN_FILE').token" 2>/dev/null || true)
    if [[ -n "$TOKEN" ]]; then
      echo "[deploy] ensuring project name='$PROJECT_NAME', SSO + password protection disabled…"
      curl -sS -X PATCH "https://api.vercel.com/v9/projects/$PROJECT_ID?teamId=$TEAM_ID" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"ssoProtection\": null, \"passwordProtection\": null, \"name\": \"$PROJECT_NAME\"}" \
        > /dev/null
    fi
  fi
fi

echo
echo "[deploy] live URLs:"
echo "  https://$PROJECT_NAME-$VERCEL_SCOPE.vercel.app"
