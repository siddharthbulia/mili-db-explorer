import { getStore } from './store';
import type { LicenseInfo } from '../shared/types';
import { generateLicenseKey, validateLicenseKey } from '../shared/license-core';

export { generateLicenseKey, validateLicenseKey };

export function getLicense(): LicenseInfo {
  return getStore().getLicense();
}

export function activateLicense(key: string, email: string): { ok: boolean; error?: string; license?: LicenseInfo } {
  if (!validateLicenseKey(key, email)) {
    return { ok: false, error: 'Invalid license key for this email.' };
  }
  const license: LicenseInfo = {
    status: 'pro',
    key: key.trim().toUpperCase(),
    email: email.toLowerCase().trim(),
    validatedAt: Date.now(),
  };
  getStore().setLicense(license);
  return { ok: true, license };
}

export function deactivateLicense() {
  getStore().setLicense({ status: 'free' });
}
