"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findBusinessesByName = findBusinessesByName;
exports.bestNameSimilarity = bestNameSimilarity;
exports.activateListingForDays = activateListingForDays;
exports.notifyBusinessLive = notifyBusinessLive;
const supabase_server_js_1 = require("./supabase-server.js");
const whatsapp_js_1 = require("./whatsapp.js");
const site_url_js_1 = require("./site-url.js");
const phone_js_1 = require("./phone.js");
// Portal access for a business that registered through WhatsApp: it never chose
// a password, so "log in with @username" alone leaves the owner locked out.
// When no account exists yet, hand over the account-setup link instead.
async function portalAccessLines(biz) {
    const login = biz.username
        ? `🔑 Portal: ${site_url_js_1.SITE_URL}/portal (log in with @${biz.username})`
        : `🔑 Portal: ${site_url_js_1.SITE_URL}/portal`;
    try {
        const supabase = (0, supabase_server_js_1.getSupabase)();
        const { data: account } = await supabase
            .from('business_accounts')
            .select('id')
            .eq('business_id', biz.id)
            .maybeSingle();
        if (account)
            return [login];
        const { data: row } = await supabase
            .from('businesses')
            .select('edit_token')
            .eq('id', biz.id)
            .maybeSingle();
        const token = row?.edit_token || '';
        if (!token)
            return [login];
        return [
            `🔐 Create your portal password: ${site_url_js_1.SITE_URL}/account-setup?token=${token}`,
            `✏️ Edit your listing: ${site_url_js_1.SITE_URL}/edit?token=${token}`,
        ];
    }
    catch {
        return [login];
    }
}
const CANDIDATE_COLUMNS = 'id, name, phone, slug, username, city, verified, payment_status, created_at';
function normalizeName(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function levenshtein(a, b) {
    if (a === b)
        return 0;
    if (!a.length || !b.length)
        return Math.max(a.length, b.length);
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
}
// 0..1 similarity between two normalized names.
function nameSimilarity(a, b) {
    if (!a || !b)
        return 0;
    if (a === b)
        return 1;
    const dist = levenshtein(a, b);
    const sim = 1 - dist / Math.max(a.length, b.length);
    // Containment bonus: "diamond trading" inside "diamond tradings cc" is a hit.
    const containment = a.includes(b) || b.includes(a) ? 0.85 : 0;
    return Math.max(sim, containment);
}
// Fuzzy business lookup for admin commands. Tokens match via ILIKE, then the
// best candidate wins by normalized-name similarity — a typo'd query still
// finds its target.
async function findBusinessesByName(query, limit = 6) {
    const norm = normalizeName(query);
    if (!norm)
        return [];
    const tokens = norm.split(' ').filter(t => t.length >= 3);
    if (!tokens.length)
        return [];
    const supabase = (0, supabase_server_js_1.getSupabase)();
    const { data } = await supabase
        .from('businesses')
        .select(CANDIDATE_COLUMNS)
        .or(tokens.map(t => `name.ilike.%${t}%`).join(','))
        .order('created_at', { ascending: false })
        .limit(50);
    const rows = data || [];
    if (!rows.length)
        return [];
    return rows
        .map(r => {
        const sim = nameSimilarity(norm, normalizeName(r.name));
        // Exact business id / username match is a perfect hit.
        const idHit = (r.username && norm.replace(/\s+/g, '') === r.username.toLowerCase()) ||
            (r.phone && norm.replace(/\s+/g, '') === (0, phone_js_1.digitsOnly)(r.phone));
        return { cand: r, sim: idHit ? 1 : sim };
    })
        .sort((a, b) => b.sim - a.sim)
        .slice(0, limit)
        .map(x => x.cand);
}
function bestNameSimilarity(query, name) {
    return nameSimilarity(normalizeName(query), normalizeName(name));
}
// Approve (or re-grant) a listing for N days: writes/extends an active
// listing_subscriptions row so the existing cron reminders + expiry machinery
// takes over automatically. Unpaid admin grants expire instead of running
// forever.
async function activateListingForDays(businessId, days) {
    const supabase = (0, supabase_server_js_1.getSupabase)();
    const now = new Date();
    const { data: existing } = await supabase
        .from('listing_subscriptions')
        .select('id, expires_at, amount, is_trial, paynow_reference')
        .eq('business_id', businessId)
        .eq('status', 'active')
        .maybeSingle();
    const base = existing?.expires_at && new Date(existing.expires_at) > now
        ? new Date(existing.expires_at)
        : now;
    const expiresAt = new Date(base.getTime() + days * 86400000);
    // A verify grant is free time, not a sale. `is_trial` keeps it out of the
    // revenue and subscription reports, and no trial clock is set here: this is
    // not the 90-day trial, so approving a listing does not spend it.
    const freeGrant = (row) => Number(row.amount || 0) <= 0 && !row.paynow_reference;
    if (existing) {
        const { error } = await supabase
            .from('listing_subscriptions')
            .update({
            expires_at: expiresAt.toISOString(),
            renewal_notified_at: null,
            ...(freeGrant(existing) ? { is_trial: true, auto_confirmed_at: null } : {}),
        })
            .eq('id', existing.id);
        if (error)
            return { ok: false, error: error.message };
    }
    else {
        const { error } = await supabase
            .from('listing_subscriptions')
            .insert({
            business_id: businessId,
            status: 'active',
            amount: 0,
            plan: '1m',
            started_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            is_trial: true,
        });
        if (error)
            return { ok: false, error: error.message };
    }
    const { error: bizError } = await supabase
        .from('businesses')
        .update({
        verified: true,
        payment_status: 'active',
        listing_activated_at: now.toISOString(),
    })
        .eq('id', businessId);
    if (bizError)
        return { ok: false, error: bizError.message };
    return { ok: true, expiresAt: expiresAt.toISOString() };
}
// The go-live moment, shared by the dashboard Approve button and the bot
// verify command: approved template (works outside the 24h window) followed
// by a best-effort links message — profile, auto-generated website, portal —
// plus the shop and channel instructions. The website link lands here, not
// just on payment.
async function notifyBusinessLive(biz) {
    if (!biz.phone)
        return;
    const to = '+' + (0, phone_js_1.digitsOnly)(biz.phone);
    const slug = biz.slug || biz.id;
    const portalLines = await portalAccessLines(biz);
    const details = [
        '🎉 *You are live on WA Directory!*',
        '',
        `${biz.name} is approved${biz.username ? ` (@${biz.username})` : ''} - customers can find you and your products in search now.`,
        '',
        `🏢 Profile: ${site_url_js_1.SITE_URL}/business/${slug}`,
        `🌐 Website: ${site_url_js_1.SITE_URL}/site/${slug}`,
        ...portalLines,
        '',
        '*How to add products to your online shop*',
        '📸 Send a product photo, then reply or caption it with *name and price* (e.g. *bread $2*) - it lands on your website shop shelf.',
        '',
        'Reply *help* anytime.',
    ].join('\n');
    // Free-form first: it carries every detail, and it works whenever the owner
    // has messaged recently (they just registered and were searching while they
    // waited). Sending the details here also means a missing/renamed Meta
    // template can no longer swallow the whole go-live message.
    //
    // Serverless freezes the function the instant the last awaited task ends,
    // killing any send still in flight - so every send is awaited.
    const sent = await (0, whatsapp_js_1.sendWhatsAppMessage)(to, details);
    if (sent)
        return;
    // Outside the 24-hour window free-form text is rejected. Fall back to the
    // approved template, then make sure the admin can still deliver the links.
    let templateOk = false;
    try {
        templateOk = await (0, whatsapp_js_1.sendWhatsAppTemplate)(to, process.env.WHATSAPP_TEMPLATE_APPROVED || 'you_are_live', [biz.name, `${site_url_js_1.SITE_URL}/business/${slug}`]);
    }
    catch (e) {
        console.error('[admin-verify] go-live template failed:', e);
    }
    if (templateOk)
        return;
    const admin = (process.env.ADMIN_WHATSAPP || '').replace(/\D/g, '');
    if (admin) {
        try {
            await (0, whatsapp_js_1.sendWhatsAppMessage)('+' + admin, [
                `⚠️ Go-live message could not reach *${biz.name}* (+${(0, phone_js_1.digitsOnly)(biz.phone)}).`,
                'Meta blocked free-form text (24h window closed) and the approved template is not configured.',
                'Ask them to send *hi* to the bot, then run *welcome ' + biz.name + '* to resend these details:',
                '',
                details,
            ].join('\n'));
        }
        catch (e) {
            console.error('[admin-verify] admin delivery alert failed:', e);
        }
    }
}
