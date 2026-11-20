"use strict";
/**
 * Structured onboarding/registration logs.
 *
 * Every state transition, plan choice, Flow launch/fallback, trial activation
 * and payment-amount calculation writes one JSON line. Phone numbers are
 * masked and no message contents, names, addresses or payment details are
 * logged.
 *
 * Search production logs with:  [onboarding]
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskPhone = maskPhone;
exports.logOnboarding = logOnboarding;
function maskPhone(phone) {
    const digits = (phone || '').replace(/\D/g, '');
    if (digits.length < 5)
        return '***';
    return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
}
function logOnboarding(event, fields = {}) {
    try {
        console.info(`[onboarding] ${JSON.stringify({
            event,
            at: new Date().toISOString(),
            ...fields,
        })}`);
    }
    catch {
        // Logging must never break a user flow.
    }
}
