"use strict";
// Shared business lookup for the payment flow — used by both /api/pay (web
// "pay for any business" selector) and the WhatsApp bot pay flow. Strategies
// run in parallel and results are merged in a fixed priority order, each row
// tagged with the strategy that found it so richer UIs (like the web
// match-type filter) keep working.
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAY_BUSINESS_COLUMNS = void 0;
exports.searchPayBusinesses = searchPayBusinesses;
const business_id_js_1 = require("./business-id.js");
const username_js_1 = require("./username.js");
const phone_js_1 = require("./phone.js");
exports.PAY_BUSINESS_COLUMNS = 'id, name, slug, business_id, username, phone, city, area, logo_url, category, payment_status';
// Search for businesses by ID, username, phone, and name — see file header.
async function searchPayBusinesses(supabase, query) {
    const trimmed = query.trim();
    if (!trimmed)
        return [];
    const found = new Map();
    function add(rows, match) {
        for (const row of rows || []) {
            if (!found.has(row.id))
                found.set(row.id, { ...row, match });
        }
    }
    // 1. Exact business ID match + 2. phone search are conditional; all four
    // strategies are independent queries — fetch in parallel, then merge in
    // priority order (first match wins tagging).
    const idQuery = (0, business_id_js_1.isValidBusinessId)(trimmed)
        ? supabase.from('businesses').select(exports.PAY_BUSINESS_COLUMNS).eq('business_id', trimmed).maybeSingle()
        : null;
    const digits = (0, phone_js_1.digitsOnly)(trimmed);
    const phoneQuery = digits.length >= 9
        ? supabase.from('businesses').select(exports.PAY_BUSINESS_COLUMNS).eq('phone', digits).limit(10)
        : null;
    const [idRes, phoneRes, allBizRes, nameRes] = await Promise.all([
        idQuery,
        phoneQuery,
        supabase.from('businesses').select(exports.PAY_BUSINESS_COLUMNS).not('username', 'is', null).limit(100),
        supabase.from('businesses').select(exports.PAY_BUSINESS_COLUMNS).ilike('name', `%${trimmed}%`).limit(10),
    ]);
    if (idRes)
        add(idRes.data ? [idRes.data] : [], 'business_id');
    add(phoneRes?.data || null, 'phone');
    add((allBizRes.data || []).filter(b => b.username && (0, username_js_1.usernameMatches)(trimmed, b.username)), 'username');
    add(nameRes.data, 'name');
    return Array.from(found.values());
}
