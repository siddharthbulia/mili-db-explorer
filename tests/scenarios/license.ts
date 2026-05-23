import { group, test, eq, assert } from '../harness';
import { generateLicenseKey, validateLicenseKey } from '../../src/shared/license-core';

const EMAILS = [
  'alice@example.com',
  'BOB@EXAMPLE.COM',
  'mixed.Case+tag@Mail.Example.Co',
  'a@b.c',
  'long.email.address.with.dots@subdomain.example.com',
  'unicode-tëst@example.com',
];

group('license — valid keys validate', () => {
  for (const email of EMAILS) {
    for (let i = 0; i < 25; i++) {
      const key = generateLicenseKey(email);
      test(`key #${i} for ${email}`, () => {
        assert(validateLicenseKey(key, email), `generated key should validate`);
        assert(validateLicenseKey(key, email.toUpperCase()), `case-insensitive validation`);
        assert(validateLicenseKey(key.toLowerCase(), email), `lowercase key still validates`);
        assert(validateLicenseKey(`  ${key}  `, email), `padded key validates after trim`);
      });
    }
  }
});

group('license — invalid keys reject', () => {
  const fixed = generateLicenseKey('alice@example.com');
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
    test(`reject: ${JSON.stringify(b).slice(0, 50)}`, () => {
      eq(validateLicenseKey(b, 'alice@example.com'), false);
    });
  }
  test('empty email rejected', () => {
    eq(validateLicenseKey(fixed, ''), false);
  });
  test('null inputs rejected', () => {
    eq(validateLicenseKey(undefined as any, undefined as any), false);
    eq(validateLicenseKey(null as any, null as any), false);
  });
});

group('license — wrong email rejects', () => {
  for (let i = 0; i < 30; i++) {
    const realEmail = `user${i}@example.com`;
    const wrongEmail = `other${i}@example.com`;
    const key = generateLicenseKey(realEmail);
    test(`key for ${realEmail} should not validate for ${wrongEmail}`, () => {
      eq(validateLicenseKey(key, wrongEmail), false);
    });
  }
});

group('license — format is well-formed', () => {
  for (let i = 0; i < 50; i++) {
    test(`format check iteration ${i}`, () => {
      const key = generateLicenseKey(`x${i}@example.com`);
      assert(/^PRO-[A-Z2-9]{12}-[A-F0-9]{4}$/.test(key));
    });
  }
});
