"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LICENSE_SECRET = void 0;
exports.generateLicenseKey = generateLicenseKey;
exports.validateLicenseKey = validateLicenseKey;
// Pure license-key utilities, free of any Electron / Node-fs imports so they
// can be unit-tested in isolation.
const node_crypto_1 = __importDefault(require("node:crypto"));
exports.LICENSE_SECRET = 'mili-db-explorer-pro-v1-2025';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function base32(buf) {
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
    if (bits > 0)
        out += ALPHABET[(value << (5 - bits)) & 31];
    return out;
}
function generateLicenseKey(email) {
    const salt = node_crypto_1.default.randomBytes(8);
    const payload = base32(salt).slice(0, 12);
    const sig = node_crypto_1.default
        .createHmac('sha256', exports.LICENSE_SECRET)
        .update(`${email.toLowerCase()}|${payload}`)
        .digest('hex')
        .slice(0, 4)
        .toUpperCase();
    return `PRO-${payload}-${sig}`;
}
function validateLicenseKey(key, email) {
    if (!key || !email)
        return false;
    const trimmed = key.trim().toUpperCase();
    const m = /^PRO-([A-Z2-9]{12})-([A-F0-9]{4})$/.exec(trimmed);
    if (!m)
        return false;
    const [, payload, sig] = m;
    const expected = node_crypto_1.default
        .createHmac('sha256', exports.LICENSE_SECRET)
        .update(`${email.toLowerCase().trim()}|${payload}`)
        .digest('hex')
        .slice(0, 4)
        .toUpperCase();
    return sig === expected;
}
