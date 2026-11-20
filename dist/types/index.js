"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORT_TIERS = exports.TRIAL_PRICE = exports.TRIAL_PLAN_LABEL = exports.TRIAL_DAYS = exports.PRO_ASSISTANCE_PRICE = exports.PERSONAL_PLAN_CONFIG = exports.PLAN_CONFIG = void 0;
exports.formatUsd = formatUsd;
exports.businessPlanLabel = businessPlanLabel;
exports.personalPlanLabel = personalPlanLabel;
exports.PLAN_CONFIG = {
    '1m': { label: '1 Month', months: 1, days: 30, price: 2.0, perMonth: 2.0 },
    '6m': { label: '6 Months', months: 6, days: 180, price: 10.0, perMonth: 1.67 },
    '12m': { label: '12 Months', months: 12, days: 360, price: 20.0, perMonth: 1.67 },
};
// Personal-contact listings share the same durations as business packages at
// half the price: USD 1/month, USD 5 / 6 months, USD 10 / year. Same plan keys
// so listing_subscriptions.plan and activation day counts (30/180/360) carry
// over untouched; the amount override lives on the payment call.
exports.PERSONAL_PLAN_CONFIG = {
    '1m': { label: '1 Month', months: 1, days: 30, price: 1.0, perMonth: 1.0 },
    '6m': { label: '6 Months', months: 6, days: 180, price: 5.0, perMonth: 0.83 },
    '12m': { label: '12 Months', months: 12, days: 360, price: 10.0, perMonth: 0.83 },
};
exports.PRO_ASSISTANCE_PRICE = 2.0;
// === Authoritative trial configuration ===
// Business listings may start with one 90-day free trial. The trial starts
// when an administrator approves/publishes the listing — never at registration
// or submission — and is a zero-amount subscription, not a discount.
exports.TRIAL_DAYS = 90;
exports.TRIAL_PLAN_LABEL = '90-Day Free Trial';
exports.TRIAL_PRICE = 0;
/** Format a USD amount the way every surface (bot, portal, admin) shows it. */
function formatUsd(amount) {
    return `$${Number(amount).toFixed(2)}`;
}
/** Human label + price for a business plan, derived from PLAN_CONFIG only. */
function businessPlanLabel(plan) {
    const p = exports.PLAN_CONFIG[plan];
    return `${p.label} — USD ${formatUsd(p.price)}`;
}
/** Human label + price for a personal-contact plan. */
function personalPlanLabel(plan) {
    const p = exports.PERSONAL_PLAN_CONFIG[plan];
    return `${p.label} — USD ${formatUsd(p.price)}`;
}
exports.SUPPORT_TIERS = {
    bronze: {
        label: 'Bronze',
        price: 10.0,
        features: [
            'Monthly 15-min WhatsApp check-in',
            'Profile & SEO review (quarterly)',
            'Priority email support (48h response)',
            'Auto-website content audit (quarterly)',
        ],
    },
    silver: {
        label: 'Silver',
        price: 25.0,
        features: [
            'Everything in Bronze, plus:',
            'Bi-weekly 20-min strategy call (WhatsApp/voice)',
            'WhatsApp Business catalog optimization (monthly)',
            'Competitor benchmark report (quarterly)',
            'WhatsApp template message setup & approval help',
            'Priority support (24h response)',
        ],
    },
    gold: {
        label: 'Gold',
        price: 50.0,
        features: [
            'Everything in Silver, plus:',
            'Weekly 30-min dedicated concierge session',
            'Full WhatsApp Business API configuration & maintenance',
            'Custom automation flows (catalog sync, auto-replies, labels)',
            'Monthly growth report with actionable insights',
            'Direct line to account manager (WhatsApp + email)',
            'Quarterly on-site/virtual business review',
            'Custom integration assistance (CRM, POS, etc.)',
        ],
    },
};
