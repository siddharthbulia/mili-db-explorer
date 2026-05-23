/**
 * electron-builder afterSign hook → notarizes the signed .app with Apple.
 *
 * Reads APPLE_ID / APPLE_PASSWORD (app-specific) / APPLE_TEAM_ID from .env at
 * repo root. Skips if any are missing (useful for local unsigned dev builds).
 */
const path = require('node:path');
const fs = require('node:fs');

// Load .env from repo root without adding a dotenv dep.
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

module.exports = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn('[notarize] APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID not set — skipping notarization.');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`[notarize] submitting ${appPath} (team ${teamId}, account ${appleId})…`);

  const { notarize } = require('@electron/notarize');
  await notarize({
    tool: 'notarytool',
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });

  console.log('[notarize] done.');
};
