"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActingPortalBusiness = getActingPortalBusiness;
exports.getOrgDashboardStats = getOrgDashboardStats;
exports.getSubscription = getSubscription;
exports.isPaidSubscriber = isPaidSubscriber;
exports.getListingSubscription = getListingSubscription;
exports.getSupportSubscription = getSupportSubscription;
exports.getDailyStats = getDailyStats;
exports.getLifetimeTotals = getLifetimeTotals;
exports.buildChartData = buildChartData;
const supabase_server_js_1 = require("./supabase-server.js");
const org_auth_js_1 = require("./org-auth.js");
/**
 * Session + the business the session may act on for this request.
 * * Branch / single business: always its own listing.
 * * HQ with a ?branch=<id> param: that branch, but only if it belongs to
 *   the HQ's org (resolveActingBusinessId enforces this — anything else
 *   falls back to the HQ's own listing).
 */
async function getActingPortalBusiness(requestedBranchId, cookieAdapter) {
    const actor = await (0, org_auth_js_1.getPortalActor)(cookieAdapter);
    if (!actor)
        return null;
    const actingId = await (0, org_auth_js_1.resolveActingBusinessId)(actor, requestedBranchId);
    if (actingId === actor.business.id)
        return { actor, business: actor.business };
    const { data } = await (0, supabase_server_js_1.getSupabase)().from('businesses').select('*').eq('id', actingId).maybeSingle();
    if (!data)
        return { actor, business: actor.business };
    return { actor, business: data };
}
/**
 * Org-wide stats for the HQ dashboard: per-listing 7-day profile views and
 * WhatsApp clicks, plus org totals. All queries are scoped by the org's
 * business ids — computed here, never from client input.
 */
async function getOrgDashboardStats(orgBusinesses) {
    const supabase = (0, supabase_server_js_1.getSupabase)();
    const ids = orgBusinesses.map(b => b.id);
    if (ids.length === 0)
        return { perBranch: {}, orgTotals: { views: 0, chats: 0 } };
    const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const { data } = await supabase
        .from('daily_stats')
        .select('business_id, type, count')
        .in('business_id', ids)
        .gte('date', since)
        .in('type', ['profile_view', 'click_whatsapp']);
    const perBranch = {};
    for (const b of orgBusinesses)
        perBranch[b.id] = { views: 0, chats: 0 };
    let orgViews = 0;
    let orgChats = 0;
    for (const row of data || []) {
        const entry = perBranch[row.business_id];
        if (!entry)
            continue;
        if (row.type === 'profile_view') {
            entry.views += Number(row.count);
            orgViews += Number(row.count);
        }
        else {
            entry.chats += Number(row.count);
            orgChats += Number(row.count);
        }
    }
    return { perBranch, orgTotals: { views: orgViews, chats: orgChats } };
}
async function getSubscription(businessId) {
    const { data } = await (0, supabase_server_js_1.getSupabase)()
        .from('subscriptions')
        .select('status, expires_at, amount, admin_note')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (!data)
        return null;
    return { status: data.status, expiresAt: data.expires_at, amount: data.amount, adminNote: data.admin_note };
}
async function isPaidSubscriber(businessId) {
    const sub = await getSubscription(businessId);
    return sub?.status === 'active' && (!sub.expiresAt || new Date(sub.expiresAt) > new Date());
}
async function getListingSubscription(businessId) {
    const { data } = await (0, supabase_server_js_1.getSupabase)()
        .from('listing_subscriptions')
        .select('status, expires_at, amount, payer_phone, plan, pro_assistance')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (!data)
        return null;
    return {
        status: data.status,
        expiresAt: data.expires_at,
        amount: data.amount,
        payerPhone: data.payer_phone,
        plan: data.plan || '1m',
        proAssistance: data.pro_assistance || false,
    };
}
async function getSupportSubscription(businessId) {
    const { data } = await (0, supabase_server_js_1.getSupabase)()
        .from('support_subscriptions')
        .select('tier, price_usd, status, current_period_end, external_subscription_id')
        .eq('biz_id', businessId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (!data)
        return null;
    return {
        tier: data.tier,
        priceUsd: data.price_usd,
        status: data.status,
        currentPeriodEnd: data.current_period_end,
        externalSubscriptionId: data.external_subscription_id,
    };
}
async function getDailyStats(businessId, days) {
    const supabase = (0, supabase_server_js_1.getSupabase)();
    let q = supabase
        .from('daily_stats')
        .select('date, type, count')
        .eq('business_id', businessId);
    if (days)
        q = q.gte('date', new Date(Date.now() - days * 86400000).toISOString().slice(0, 10));
    q = q.order('date', { ascending: true });
    const { data } = await q;
    return data || [];
}
async function getLifetimeTotals(businessId) {
    const { data } = await (0, supabase_server_js_1.getSupabase)()
        .from('daily_stats')
        .select('type, count')
        .eq('business_id', businessId);
    const totals = {};
    for (const row of data || []) {
        totals[row.type] = (totals[row.type] || 0) + Number(row.count);
    }
    return totals;
}
function buildChartData(rows, types) {
    const byDate = new Map();
    for (const r of rows) {
        if (!types.includes(r.type))
            continue;
        if (!byDate.has(r.date))
            byDate.set(r.date, {});
        byDate.get(r.date)[r.type] = (byDate.get(r.date)[r.type] || 0) + Number(r.count);
    }
    // Fill missing dates with zeros to maintain a continuous timeline
    const allDates = Array.from(byDate.keys()).sort();
    if (allDates.length === 0)
        return [];
    const start = new Date(allDates[0]);
    const end = new Date(allDates[allDates.length - 1]);
    const filled = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        const values = byDate.get(dateStr) || {};
        filled.push({
            date: dateStr,
            label: dateStr.slice(5),
            values,
            total: Object.keys(values).reduce((sum, k) => sum + (values[k] || 0), 0),
        });
    }
    return filled;
}
