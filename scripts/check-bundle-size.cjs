#!/usr/bin/env node
// Bundle size CI check (docs/PERFORMANCE.md §11.3).
//
// Fails if dist/assets/index-*.js is missing or exceeds the budget.

const fs = require('node:fs');
const path = require('node:path');

const LIMIT_BYTES = Number(process.env.BUNDLE_LIMIT_BYTES || 4_500_000); // 4.5 MB raw
const DIST = path.resolve(__dirname, '..', 'dist', 'assets');

if (!fs.existsSync(DIST)) {
  process.stderr.write(`bundle-check: ${DIST} does not exist. Run \`npm run build\` first.\n`);
  process.exit(2);
}

const candidates = fs
  .readdirSync(DIST)
  .filter((n) => /^index-.*\.js$/.test(n))
  .map((n) => path.join(DIST, n));

if (candidates.length === 0) {
  process.stderr.write(`bundle-check: no index-*.js found in ${DIST}\n`);
  process.exit(2);
}

let failed = false;
for (const f of candidates) {
  const sz = fs.statSync(f).size;
  const mb = (sz / 1_000_000).toFixed(2);
  const limitMB = (LIMIT_BYTES / 1_000_000).toFixed(2);
  const status = sz > LIMIT_BYTES ? 'OVER' : 'OK';
  process.stdout.write(`${path.basename(f)}: ${mb} MB (limit ${limitMB} MB) ${status}\n`);
  if (sz > LIMIT_BYTES) failed = true;
}

process.exit(failed ? 1 : 0);
