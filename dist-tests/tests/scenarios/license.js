"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const harness_1 = require("../harness");
const license_core_1 = require("../../src/shared/license-core");
const EMAILS = [
    'alice@example.com',
    'BOB@EXAMPLE.COM',
    'mixed.Case+tag@Mail.Example.Co',
    'a@b.c',
    'long.email.address.with.dots@subdomain.example.com',
    'unicode-tëst@example.com',
];
(0, harness_1.group)('license — valid keys validate', () => {
    for (const email of EMAILS) {
        for (let i = 0; i < 25; i++) {
            const key = (0, license_core_1.generateLicenseKey)(email);
            (0, harness_1.test)(`key #${i} for ${email}`, () => {
                (0, harness_1.assert)((0, license_core_1.validateLicenseKey)(key, email), `generated key should validate`);
                (0, harness_1.assert)((0, license_core_1.validateLicenseKey)(key, email.toUpperCase()), `case-insensitive validation`);
                (0, harness_1.assert)((0, license_core_1.validateLicenseKey)(key.toLowerCase(), email), `lowercase key still validates`);
                (0, harness_1.assert)((0, license_core_1.validateLicenseKey)(`  ${key}  `, email), `padded key validates after trim`);
            });
        }
    }
});
(0, harness_1.group)('license — invalid keys reject', () => {
    const fixed = (0, license_core_1.generateLicenseKey)('alice@example.com');
    // Pick three replacement hex chars distinct from the real last char,
    // otherwise "tampered" keys collide with the real one and validate.
    const lastChar = fixed[fixed.length - 1];
    const hexAlphabet = '0123456789ABCDEF';
    const replacements = hexAlphabet.split('').filter((c) => c !== lastChar).slice(0, 3);
    const bad = [
        '',
        'PRO',
        'PRO-',
        'PRO-XXXXXXXXXXXX',
        'PRO-XXXXXXXXXXXX-XXXX',
        'BAD-XXXXXXXXXXXX-XXXX',
        'pro-1234567890ab-aaaa',
        'PRO-1234567890AB-XYZW', // invalid hex
        'PRO-IIIIIIIIIIII-AAAA', // bad alphabet
        fixed.replace(/[A-Z]/, 'I'), // I not in base32 alphabet
        fixed.slice(0, -1) + replacements[0],
        fixed.slice(0, -1) + replacements[1],
        fixed.slice(0, -1) + replacements[2],
        fixed + 'X',
    ];
    for (const b of bad) {
        (0, harness_1.test)(`reject: ${JSON.stringify(b).slice(0, 50)}`, () => {
            (0, harness_1.eq)((0, license_core_1.validateLicenseKey)(b, 'alice@example.com'), false);
        });
    }
    (0, harness_1.test)('empty email rejected', () => {
        (0, harness_1.eq)((0, license_core_1.validateLicenseKey)(fixed, ''), false);
    });
    (0, harness_1.test)('null inputs rejected', () => {
        (0, harness_1.eq)((0, license_core_1.validateLicenseKey)(undefined, undefined), false);
        (0, harness_1.eq)((0, license_core_1.validateLicenseKey)(null, null), false);
    });
});
(0, harness_1.group)('license — wrong email rejects', () => {
    for (let i = 0; i < 30; i++) {
        const realEmail = `user${i}@example.com`;
        const wrongEmail = `other${i}@example.com`;
        const key = (0, license_core_1.generateLicenseKey)(realEmail);
        (0, harness_1.test)(`key for ${realEmail} should not validate for ${wrongEmail}`, () => {
            (0, harness_1.eq)((0, license_core_1.validateLicenseKey)(key, wrongEmail), false);
        });
    }
});
(0, harness_1.group)('license — format is well-formed', () => {
    for (let i = 0; i < 50; i++) {
        (0, harness_1.test)(`format check iteration ${i}`, () => {
            const key = (0, license_core_1.generateLicenseKey)(`x${i}@example.com`);
            (0, harness_1.assert)(/^PRO-[A-Z2-9]{12}-[A-F0-9]{4}$/.test(key));
        });
    }
});
