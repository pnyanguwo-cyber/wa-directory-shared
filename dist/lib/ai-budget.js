"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_DAILY_BUDGET_USD = void 0;
exports.checkAiBudget = checkAiBudget;
exports.shouldLogBudgetBlock = shouldLogBudgetBlock;
const supabase_server_js_1 = require("./supabase-server.js");
/**
 * Hard daily ceiling on what the shared Gemini key is allowed to spend.
 *
 * Spend is read from ai_usage_log, so the cap covers every caller on this
 * database (WhatsApp bot and site) rather than one process's memory. Once the
 * day's total reaches the limit, AI calls stop and each feature falls back to
 * its non-AI path until midnight Harare time.
 *
 * AI_DAILY_BUDGET_USD overrides the default; set it to 0 or "off" to disable.
 * The default matches the site's, and both read the same ai_usage_log total,
 * so the two deployments share one ceiling instead of one each.
 */
const RAW_LIMIT = process.env.AI_DAILY_BUDGET_USD ?? '1.00';
const PARSED_LIMIT = Number(RAW_LIMIT);
const LIMIT_DISABLED = RAW_LIMIT === 'off' || !Number.isFinite(PARSED_LIMIT);
exports.AI_DAILY_BUDGET_USD = LIMIT_DISABLED || PARSED_LIMIT <= 0 ? 0 : PARSED_LIMIT;
const CHECK_TTL_MS = 60_000;
const BLOCK_LOG_TTL_MS = 10 * 60_000;
let snapshot = null;
let lastBlockLogAt = 0;
// Harare is UTC+2 all year, and this matches the day the admin dashboard groups
// usage by.
function harareDayStart() {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Harare' }).format(new Date());
    return `${day}T00:00:00+02:00`;
}
async function sumSpentToday() {
    const since = harareDayStart();
    let total = 0;
    // PostgREST returns at most 1000 rows per request, so page through; the loop
    // stops early on the short last page.
    for (let page = 0; page < 25; page++) {
        const from = page * 1000;
        const { data, error } = await (0, supabase_server_js_1.getSupabase)()
            .from('ai_usage_log')
            .select('estimated_cost_usd')
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .range(from, from + 999);
        if (error)
            throw error;
        const rows = data || [];
        for (const row of rows)
            total += Number(row.estimated_cost_usd) || 0;
        if (rows.length < 1000)
            break;
    }
    return total;
}
async function checkAiBudget() {
    if (!exports.AI_DAILY_BUDGET_USD)
        return { allowed: true, spent: 0, limit: 0 };
    if (!snapshot || Date.now() - snapshot.at > CHECK_TTL_MS) {
        try {
            snapshot = { spent: await sumSpentToday(), at: Date.now() };
        }
        catch {
            // If spend cannot be read, keep serving AI rather than taking the bot
            // down on a database hiccup. The provider-side quota is the backstop.
            return { allowed: true, spent: snapshot?.spent ?? 0, limit: exports.AI_DAILY_BUDGET_USD };
        }
    }
    return {
        allowed: snapshot.spent < exports.AI_DAILY_BUDGET_USD,
        spent: snapshot.spent,
        limit: exports.AI_DAILY_BUDGET_USD,
    };
}
/** True at most once every ten minutes, so a blocked cap logs one row, not one per message. */
function shouldLogBudgetBlock() {
    const now = Date.now();
    if (now - lastBlockLogAt < BLOCK_LOG_TTL_MS)
        return false;
    lastBlockLogAt = now;
    return true;
}
