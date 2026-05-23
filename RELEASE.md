# Release process — Mili DB Explorer

End-to-end: build a signed + notarized macOS DMG, deploy a download page to
Vercel. Two scripts, fully scripted.

## One-time setup

1. Apple signing cert in keychain:
   ```sh
   security find-identity -v -p codesigning
   # expect: Developer ID Application: Mili Software Inc. (PGZ497J325)
   ```
2. Copy creds:
   ```sh
   cp .env.example .env
   # fill in APPLE_ID, APPLE_PASSWORD (app-specific), APPLE_TEAM_ID
   ```
3. Vercel CLI: `npm i -g vercel`

## Cut a release

```sh
npm run release:all
```

That's:

- `npm run release:mac` → cleans `release/`, builds renderer + main, runs
  `electron-builder` for arm64 + x64, signs with the Mili Developer ID cert,
  notarizes via Apple's notarytool, and writes `release/Mili-DB-Explorer-<v>-<arch>.dmg`.
- `npm run release:deploy` → copies DMGs into `site/downloads/`, writes
  `manifest.json`, runs `vercel deploy --prod` from `site/`.

First deploy is interactive (`vercel login` with siddharth@getmili.ai, then
project link). Every subsequent run is hands-off.

## Bumping versions

Edit `package.json` → `version`. The filename and manifest pick it up.

## Where things live

- `scripts/build-mac.sh` — sign + notarize
- `scripts/notarize.cjs` — `afterSign` hook
- `scripts/deploy-vercel.sh` — manifest + deploy
- `build/entitlements.mac.plist` — hardened-runtime entitlements
- `site/` — static landing page (Vercel root)
- `release/` — local DMG output (gitignored)
