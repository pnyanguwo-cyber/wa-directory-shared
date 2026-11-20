"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextPacificMidnight = exports.nextHarareMidnight = void 0;
exports.formatTimeLeft = formatTimeLeft;
exports.harareClock = harareClock;
exports.markAiQuotaExhausted = markAiQuotaExhausted;
exports.getAiLimitStatus = getAiLimitStatus;
exports.renderAiLimitNotice = renderAiLimitNotice;
const bot_settings_js_1 = require("./bot-settings.js");
const ai_budget_js_1 = require("./ai-budget.js");
/**
 * Whether AI is currently unavailable for a reason that will clear on its own,
 * and exactly when. Two causes are covered:
 *
 * - our own daily spend ceiling, which clears at midnight Harare;
 * - Google's daily quota, which returns 429 for every model and clears at
 *   midnight Pacific time — a different clock, so it cannot be assumed.
 *
 * The quota marker lives in bot_settings because it is a fact about the key,
 * not about one request: any instance that hits it teaches every other one.
 */
const QUOTA_KEY = 'ai_limit_until';
function nextMidnight(offsetHours) {
    const now = new Date();
    const shifted = new Date(now.getTime() + offsetHours * 3_600_000);
    shifted.setUTCHours(24, 0, 0, 0);
    return new Date(shifted.getTime() - offsetHours * 3_600_000);
}
/** Harare (UTC+2, no DST) and Pacific (UTC-8, no DST in winter) midnights. */
const nextHarareMidnight = () => nextMidnight(2);
exports.nextHarareMidnight = nextHarareMidnight;
const nextPacificMidnight = () => nextMidnight(-8);
exports.nextPacificMidnight = nextPacificMidnight;
/** "3h 12m", "45m" or "under a minute" — what the user needs, not milliseconds. */
function formatTimeLeft(resetAt, now = Date.now()) {
    const ms = resetAt.getTime() - now;
    if (ms <= 60_000)
        return 'under a minute';
    const minutes = Math.ceil(ms / 60_000);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0)
        return `${rest}m`;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
/** Clock time in Harare, e.g. "00:00". */
function harareClock(date) {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Harare',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
}
/** Records that Google refused every model with 429 today. Best effort. */
async function markAiQuotaExhausted() {
    const until = (0, exports.nextPacificMidnight)();
    await (0, bot_settings_js_1.setBotSetting)(QUOTA_KEY, until.toISOString());
}
async function getAiLimitStatus() {
    const budget = await (0, ai_budget_js_1.checkAiBudget)();
    if (!budget.allowed) {
        return { limited: true, resetAt: (0, exports.nextHarareMidnight)(), reason: 'budget' };
    }
    const stored = await (0, bot_settings_js_1.getBotSetting)(QUOTA_KEY);
    if (stored) {
        const until = new Date(stored);
        if (!Number.isNaN(until.getTime()) && until.getTime() > Date.now()) {
            return { limited: true, resetAt: until, reason: 'quota' };
        }
    }
    return { limited: false, resetAt: null, reason: null };
}
/** The line a customer sees when AI work is paused but the directory still works. */
function renderAiLimitNotice(resetAt) {
    return (`⏳ Our AI helper has reached its limit for now, so photos, voice notes and smart wording are paused.\n\n` +
        `It is back in *${formatTimeLeft(resetAt)}* (${harareClock(resetAt)} your time).\n\n` +
        `Searching, browsing listings and paying all still work normally.`);
}
