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
export declare function maskPhone(phone: string): string;
export declare function logOnboarding(event: string, fields?: Record<string, unknown>): void;
//# sourceMappingURL=onboarding-log.d.ts.map