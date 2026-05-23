"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateLicenseKey = exports.generateLicenseKey = void 0;
exports.getLicense = getLicense;
exports.activateLicense = activateLicense;
exports.deactivateLicense = deactivateLicense;
const store_1 = require("./store");
const license_core_1 = require("../shared/license-core");
Object.defineProperty(exports, "generateLicenseKey", { enumerable: true, get: function () { return license_core_1.generateLicenseKey; } });
Object.defineProperty(exports, "validateLicenseKey", { enumerable: true, get: function () { return license_core_1.validateLicenseKey; } });
function getLicense() {
    return (0, store_1.getStore)().getLicense();
}
function activateLicense(key, email) {
    if (!(0, license_core_1.validateLicenseKey)(key, email)) {
        return { ok: false, error: 'Invalid license key for this email.' };
    }
    const license = {
        status: 'pro',
        key: key.trim().toUpperCase(),
        email: email.toLowerCase().trim(),
        validatedAt: Date.now(),
    };
    (0, store_1.getStore)().setLicense(license);
    return { ok: true, license };
}
function deactivateLicense() {
    (0, store_1.getStore)().setLicense({ status: 'free' });
}
