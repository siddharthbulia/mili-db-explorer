// Pure license-key utilities, free of any Electron / Node-fs imports so they
// can be unit-tested in isolation.
import crypto from 'node:crypto';

export const LICENSE_SECRET = 'mili-db-explorer-pro-v1-2025';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function base32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function generateLicenseKey(email: string): string {
  const salt = crypto.randomBytes(8);
  const payload = base32(salt).slice(0, 12);
  const sig = crypto
    .createHmac('sha256', LICENSE_SECRET)
    .update(`${email.toLowerCase()}|${payload}`)
    .digest('hex')
    .slice(0, 4)
    .toUpperCase();
  return `PRO-${payload}-${sig}`;
}

export function validateLicenseKey(key: string, email: string): boolean {
  if (!key || !email) return false;
  const trimmed = key.trim().toUpperCase();
  const m = /^PRO-([A-Z2-9]{12})-([A-F0-9]{4})$/.exec(trimmed);
  if (!m) return false;
  const [, payload, sig] = m;
  const expected = crypto
    .createHmac('sha256', LICENSE_SECRET)
    .update(`${email.toLowerCase().trim()}|${payload}`)
    .digest('hex')
    .slice(0, 4)
    .toUpperCase();
  return sig === expected;
}
