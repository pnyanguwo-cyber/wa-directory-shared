"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUOTES_PER_SEARCH = exports.CEREMONY_IDLE_HOURS = exports.QUOTE_RELAY_CAP = void 0;
exports.createNeed = createNeed;
exports.getNeedByRqId = getNeedByRqId;
exports.canonicalRq = canonicalRq;
exports.getNeedById = getNeedById;
exports.listRecentNeeds = listRecentNeeds;
exports.listOpenNeeds = listOpenNeeds;
exports.listNeedsOnDay = listNeedsOnDay;
exports.closeNeedByRqId = closeNeedByRqId;
exports.addNeedQuote = addNeedQuote;
exports.listNeedQuotes = listNeedQuotes;
exports.getQuoteById = getQuoteById;
exports.appendNeedTrace = appendNeedTrace;
exports.needHasTrace = needHasTrace;
exports.reopenNeed = reopenNeed;
exports.fmtHarare = fmtHarare;
exports.parseDigestWindow = parseDigestWindow;
exports.getDigestCursor = getDigestCursor;
exports.bumpDigestCursor = bumpDigestCursor;
exports.setPrioritySwitch = setPrioritySwitch;
exports.searchesInWindow = searchesInWindow;
exports.compileDigest = compileDigest;
exports.channelPostFor = channelPostFor;
exports.prioritySwitchState = prioritySwitchState;
exports.adminWeeklyStats = adminWeeklyStats;
const supabase_server_js_1 = require("./supabase-server.js");
const bot_settings_js_1 = require("./bot-settings.js");
exports.QUOTE_RELAY_CAP = 5;
exports.CEREMONY_IDLE_HOURS = 22;
const NEED_COLUMNS = 'id, rq_id, buyer_phone, item, qty, budget, city, category, status, closed_by, quotes_forwarded, winner_quote_id, created_at, updated_at';
const QUOTE_COLUMNS = 'id, need_id, supplier_phone, supplier_name, price, body, status, created_at';
// Human id. Retry-safe: random draw collides rarely; unique index catches it.
async function createNeed(fields) {
    try {
        const supabase = (0, supabase_server_js_1.getSupabase)();
        for (let attempt = 0; attempt < 5; attempt++) {
            const rqId = `RQ-${Math.floor(1000 + Math.random() * 9000)}`;
            const { data, error } = await supabase
                .from('work_needs')
                .insert({
                rq_id: rqId,
                buyer_phone: fields.buyer_phone,
                item: fields.item.slice(0, 300),
                qty: (fields.qty || '').slice(0, 60),
                budget: (fields.budget || '').slice(0, 60),
                city: (fields.city || '').slice(0, 40),
            })
                .select(NEED_COLUMNS)
                .single();
            if (!error && data)
                return data;
            const code = error?.code;
            if (code !== '23505')
                return null;
        }
        return null;
    }
    catch {
        return null;
    }
}
async function getNeedByRqId(rqId) {
    try {
        const canonical = canonicalRq(rqId);
        if (!canonical)
            return null;
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('work_needs')
            .select(NEED_COLUMNS)
            .eq('rq_id', canonical)
            .maybeSingle();
        return data || null;
    }
    catch {
        return null;
    }
}
/** 'rq7181' | 'rq-7181' | 'RQ 7181' → 'RQ-7181'; '' when not parseable. */
function canonicalRq(raw) {
    const m = (raw || '').toLowerCase().match(/\brq[-\s]?(\d{3,8})\b/);
    return m ? `RQ-${m[1]}` : '';
}
async function getNeedById(id) {
    try {
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('work_needs')
            .select(NEED_COLUMNS)
            .eq('id', id)
            .maybeSingle();
        return data || null;
    }
    catch {
        return null;
    }
}
async function listRecentNeeds(limit = 100) {
    try {
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('work_needs')
            .select(NEED_COLUMNS)
            .order('created_at', { ascending: false })
            .limit(limit);
        return data || [];
    }
    catch {
        return [];
    }
}
async function listOpenNeeds(limit = 50) {
    try {
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('work_needs')
            .select(NEED_COLUMNS)
            .eq('status', 'open')
            .order('created_at', { ascending: false })
            .limit(limit);
        return data || [];
    }
    catch {
        return [];
    }
}
// All needs (open and closed) created on one UTC calendar day — the admin
// "needs 22-10-2026" view. Empty day returns [].
async function listNeedsOnDay(dayIso, limit = 20) {
    try {
        const start = `${dayIso.slice(0, 10)}T00:00:00Z`;
        const end = new Date(new Date(start).getTime() + 86400000).toISOString();
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('work_needs')
            .select(NEED_COLUMNS)
            .gte('created_at', start)
            .lt('created_at', end)
            .order('created_at', { ascending: false })
            .limit(limit);
        return data || [];
    }
    catch {
        return [];
    }
}
async function closeNeedByRqId(rqId, closedBy, winnerQuoteId) {
    try {
        const canonical = canonicalRq(rqId);
        if (!canonical)
            return false;
        const { error } = await (0, supabase_server_js_1.getSupabase)()
            .from('work_needs')
            .update({
            status: 'closed',
            closed_by: closedBy,
            ...(winnerQuoteId ? { winner_quote_id: winnerQuoteId } : {}),
        })
            .eq('rq_id', canonical)
            .eq('status', 'open');
        return !error;
    }
    catch {
        return false;
    }
}
/** Store a quote and return it. Hit the cap → stored is skipped, caller is
 * told the need is quiet (5 relays is plenty of attention for any buyer). */
async function addNeedQuote(needId, supplierPhone, supplierName, price, body) {
    try {
        const supabase = (0, supabase_server_js_1.getSupabase)();
        const { data: need } = await supabase
            .from('work_needs')
            .select(NEED_COLUMNS)
            .eq('id', needId)
            .single();
        if (!need)
            return { ok: false, atCap: false, quote: null };
        if ((need.quotes_forwarded || 0) >= exports.QUOTE_RELAY_CAP) {
            return { ok: false, atCap: true, quote: null };
        }
        const { data, error } = await supabase
            .from('need_quotes')
            .insert({
            need_id: needId,
            supplier_phone: supplierPhone,
            supplier_name: (supplierName || '').slice(0, 80),
            price: (price || '').slice(0, 40),
            body: body.slice(0, 500),
            status: 'sent',
        })
            .select(QUOTE_COLUMNS)
            .single();
        if (error || !data)
            return { ok: false, atCap: false, quote: null };
        await supabase
            .from('work_needs')
            .update({
            quotes_forwarded: (need.quotes_forwarded || 0) + 1,
            updated_at: new Date().toISOString(),
        })
            .eq('id', needId);
        return { ok: true, atCap: false, quote: data };
    }
    catch {
        return { ok: false, atCap: false, quote: null };
    }
}
async function listNeedQuotes(needId, limit = 20) {
    try {
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('need_quotes')
            .select(QUOTE_COLUMNS)
            .eq('need_id', needId)
            .order('created_at', { ascending: true })
            .limit(limit);
        return data || [];
    }
    catch {
        return [];
    }
}
async function getQuoteById(quoteId) {
    try {
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('need_quotes')
            .select(QUOTE_COLUMNS)
            .eq('id', quoteId)
            .maybeSingle();
        return data || null;
    }
    catch {
        return null;
    }
}
/** Newer events (deal asks, buyer confirmations) ride the trace JSONB. */
async function appendNeedTrace(needId, kind) {
    try {
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('work_needs')
            .select('trace')
            .eq('id', needId)
            .maybeSingle();
        if (!data)
            return false;
        const trace = Array.isArray(data.trace) ? data.trace : [];
        trace.push({ t: new Date().toISOString(), k: kind });
        const { error } = await (0, supabase_server_js_1.getSupabase)()
            .from('work_needs')
            .update({ trace })
            .eq('id', needId);
        return !error;
    }
    catch {
        return false;
    }
}
async function needHasTrace(needId, kind) {
    try {
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('work_needs')
            .select('trace')
            .eq('id', needId)
            .maybeSingle();
        const trace = Array.isArray(data?.trace) ? data.trace : [];
        return trace.some((e) => e?.k === kind);
    }
    catch {
        return false;
    }
}
/** Re-open: buyer said "still open" in the deal ask; ceremony firewall resets. */
async function reopenNeed(needId) {
    try {
        const { error } = await (0, supabase_server_js_1.getSupabase)()
            .from('work_needs')
            .update({
            status: 'open',
            closed_by: '',
            ceremony_sent_at: null,
            updated_at: new Date().toISOString(),
        })
            .eq('id', needId);
        return !error;
    }
    catch {
        return false;
    }
}
// ── Human formatting (Harare time, CAT = UTC+2, no DST) ──────────────────
function fmtHarare(iso, withDate = false) {
    try {
        const d = new Date(iso);
        const opts = withDate
            ? { timeZone: 'Africa/Harare', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }
            : { timeZone: 'Africa/Harare', hour: '2-digit', minute: '2-digit', hour12: false };
        const s = new Intl.DateTimeFormat('en-GB', opts).format(d);
        return s.replace(/\s/g, '');
    }
    catch {
        return iso;
    }
}
/** ISO timestamp of today (Harare) at exactly hh:mm; hh:mm greater than the
 * current Harare time rolls back one day, so "digest 10:30" checked at 08:00
 * covers yesterday 10:30 → now. Cross-midnight windows behave naturally. */
function harareTodayAt(hh, mm) {
    const now = new Date();
    const harareNow = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Harare', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now);
    const part = (type) => harareNow.find(p => p.type === type)?.value || '';
    let day = `${part('year')}-${part('month')}-${part('day')}`;
    const nowH = Number(part('hour')) % 24;
    const nowM = Number(part('minute'));
    if (hh * 60 + mm > nowH * 60 + nowM) {
        const d = new Date(`${day}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 1);
        day = d.toISOString().slice(0, 10);
    }
    return new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+02:00`).toISOString();
}
function parseTimeToken(token) {
    const m = token.trim().match(/^(\d{1,2})(?:[:. ]?(\d{2}))?\s*(am|pm)?$/i);
    if (!m)
        return null;
    let hh = Number(m[1]);
    const mm = m[2] ? Number(m[2]) : 0;
    const ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && hh < 12)
        hh += 12;
    else if (ap === 'am' && hh === 12)
        hh = 0;
    // "1030" — bare 4 digits read as hhmm
    if (!m[2] && !ap && hh > 23 && hh <= 2359 && hh % 100 < 60) {
        return { hh: Math.floor(hh / 100), mm: hh % 100 };
    }
    if (hh > 23 || mm > 59)
        return null;
    return { hh, mm };
}
/** Window for the admin's spoken forms:
 *  digest            → cursor → now
 *  digest 10:30      → today-10:30 (cross-midnight swapped) → now
 *  digest 10:30 13:00 → 10:30 → 13:00 (to < from rolls to next day) */
function parseDigestWindow(args, cursorIso) {
    const nowIso = new Date().toISOString();
    if (args.length === 0) {
        return { fromIso: cursorIso || new Date(Date.now() - 24 * 3600000).toISOString(), toIso: nowIso };
    }
    const a = parseTimeToken(args[0]);
    if (!a)
        return { fromIso: cursorIso, toIso: nowIso, error: 'time' };
    const fromIso = harareTodayAt(a.hh, a.mm);
    if (args.length === 1) {
        return { fromIso, toIso: nowIso };
    }
    const b = parseTimeToken(args[1]);
    if (!b)
        return { fromIso, toIso: nowIso, error: 'time' };
    let toIso = harareTodayAt(b.hh, b.mm);
    if (new Date(toIso) <= new Date(fromIso)) {
        const d = new Date(toIso);
        d.setUTCDate(d.getUTCDate() + 1);
        toIso = d.toISOString();
    }
    return { fromIso, toIso };
}
async function getDigestCursor() {
    return (0, bot_settings_js_1.getBotSetting)('admin_digest_cursor');
}
async function bumpDigestCursor(iso) {
    return (0, bot_settings_js_1.setBotSetting)('admin_digest_cursor', iso);
}
async function setPrioritySwitch(enabled, price) {
    const e = await (0, bot_settings_js_1.setBotSetting)('priority_supplier_enabled', enabled ? '1' : '0');
    const p = price ? await (0, bot_settings_js_1.setBotSetting)('priority_supplier_price', price) : true;
    return e && p;
}
exports.QUOTES_PER_SEARCH = 7;
/** The demand radar data for one window. */
async function searchesInWindow(fromIso, toIso, limit = 300) {
    try {
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('bot_searches')
            .select('term, city, created_at')
            .gte('created_at', fromIso)
            .lte('created_at', toIso)
            .order('created_at', { ascending: false })
            .limit(limit);
        return data || [];
    }
    catch {
        return [];
    }
}
function phoneDisplay(raw) {
    const d = (raw || '').replace(/\D/g, '');
    if (!d)
        return '-';
    return `+${d.slice(0, 3)} ${d.slice(3).replace(/(\d{3})(?=\d)/g, '$1 ')}`;
}
/** The full digest text — needs (with quote tallies) + demand radar. */
async function compileDigest(fromIso, toIso) {
    try {
        const supabase = (0, supabase_server_js_1.getSupabase)();
        const { data: needs } = await supabase
            .from('work_needs')
            .select(NEED_COLUMNS)
            .gte('created_at', fromIso)
            .lte('created_at', toIso)
            .order('created_at', { ascending: true })
            .limit(100);
        const rows = needs || [];
        const lines = [];
        const sinceLabel = fmtHarare(fromIso, true);
        const toLabel = fmtHarare(toIso, false);
        lines.push(`📦 *DEMAND DIGEST*`);
        lines.push(`${sinceLabel} → ${toLabel} (Harare)`);
        if (rows.length === 0) {
            lines.push('', 'No needs posted in this window.');
        }
        else {
            lines.push('');
            lines.push(`*NEEDS (${rows.length})*`);
            for (let i = 0; i < rows.length; i++) {
                const n = rows[i];
                // Admin ask: every request reads as item · quantity · location, with
                // the buyer's contact one tap away.
                const head = [n.qty ? `${n.qty} ×`.trim() : '', n.item].filter(Boolean).join(' ') || '-';
                const details = [
                    n.budget ? `budget ${n.budget}` : '',
                ].filter(Boolean).join(' · ');
                lines.push(`${i + 1}. ${n.rq_id} · *${head}* · ${(n.city || 'ZIMBABWE').toUpperCase()}`);
                lines.push(`   ↳ 👤 Buyer: ${phoneDisplay(n.buyer_phone)}${details ? ` · ${details}` : ''}${n.status === 'open' ? '' : ` · ${n.status.toUpperCase()}`}`);
                const cleanPhone = (n.buyer_phone || '').replace(/\D/g, '');
                const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hi, regarding your request ${n.rq_id} (${head}): `)}` : '';
                if (waLink) {
                    lines.push(`   ↳ 💬 Chat the buyer: ${waLink}`);
                }
                const quotes = (await listNeedQuotes(n.id, exports.QUOTES_PER_SEARCH)).filter(q => q.price);
                if (quotes.length > 0) {
                    lines.push(`   ↳ ${quotes.length} quote${quotes.length === 1 ? '' : 's'}: ${quotes.map(q => q.price).join(', ')}`);
                }
                else {
                    lines.push('   ↳ no quotes yet');
                }
            }
        }
        const searches = await searchesInWindow(fromIso, toIso);
        if (searches.length > 0) {
            const tally = new Map();
            for (const s of searches) {
                const key = `${s.term || '(blank)'}${s.city ? ` ${s.city}` : ''}`.trim().toLowerCase();
                tally.set(key, (tally.get(key) || 0) + 1);
            }
            const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
            lines.push('');
            lines.push(`*DEMAND RADAR (${searches.length} searches)*`);
            for (const [term, count] of top) {
                lines.push(`• ${term}${count > 1 ? ` × ${count}` : ''}`);
            }
            if (tally.size > top.length)
                lines.push(`• …and ${tally.size - top.length} more lookup variants`);
        }
        else {
            lines.push('', '*DEMAND RADAR*: no searches in this window.');
        }
        // S18.2: typed orders ride on the same record — one line, zero fluff.
        const { data: orderRows } = await supabase
            .from('supply_orders')
            .select('status, lines')
            .gte('created_at', fromIso)
            .lte('created_at', toIso)
            .limit(200);
        if (orderRows && orderRows.length > 0) {
            const claimed = orderRows.filter(r => r.status === 'claimed' || r.status === 'closed').length;
            let value = 0;
            for (const r of orderRows) {
                for (const l of (r.lines || [])) {
                    value += (l.price || 0) * (l.qty || 0);
                }
            }
            lines.push('');
            lines.push(`*ORDERS (${orderRows.length})* · ${claimed} confirmed · $${Math.round(value * 100) / 100} value`);
            lines.push('   ↳ suppliers confirm with their *orders* button; buyers get pings.');
        }
        return lines.join('\n');
    }
    catch {
        return 'Digest failed to compile - try again in a moment.';
    }
}
/** Channel-ready tip-off post (observer never sees the buyer). */
function channelPostFor(need) {
    const botNumber = (process.env.WHATSAPP_BOT_NUMBER || '').replace(/\D/g, '');
    const wa = botNumber ? `https://wa.me/${botNumber}?text=${encodeURIComponent(`${need.rq_id} quote`)}` : '(channel link pending - set WHATSAPP_BOT_NUMBER)';
    return [
        `🛒 NEED · ${(need.city || 'ZIMBABWE').toUpperCase()} · ${need.rq_id}`,
        [need.qty, need.item].filter(Boolean).join(' ') || need.item,
        need.budget ? `Budget: ${need.budget}` : 'Budget: open - quote yours',
        '',
        `👉 Quoting: reply *${need.rq_id} $your-price* here, or tap:`,
        wa,
    ].join('\n');
}
/** Paying-supplier deep link target for the dormant switch (S-later). */
async function prioritySwitchState() {
    const [enabled, price] = await Promise.all([
        (0, bot_settings_js_1.getBotSetting)('priority_supplier_enabled'),
        (0, bot_settings_js_1.getBotSetting)('priority_supplier_price'),
    ]);
    return { enabled: enabled === '1', price: price || '$3/month' };
}
/** Cheap weekly admin snapshot for the `stats` command. */
async function adminWeeklyStats() {
    try {
        const supabase = (0, supabase_server_js_1.getSupabase)();
        const since = new Date(Date.now() - 7 * 86400000).toISOString();
        const [needs, quotes, searches, contacts, orders] = await Promise.all([
            supabase.from('work_needs').select('id', { count: 'exact', head: true }).gte('created_at', since),
            supabase.from('need_quotes').select('id', { count: 'exact', head: true }).gte('created_at', since),
            supabase.from('bot_searches').select('id', { count: 'exact', head: true }).gte('created_at', since),
            supabase.from('bot_contacts').select('phone', { count: 'exact', head: true }).gte('created_at', since),
            supabase.from('supply_orders').select('id', { count: 'exact', head: true }).gte('created_at', since),
        ]);
        return [
            '📊 *Last 7 days*',
            `🛒 Needs posted: ${needs.count ?? 0}`,
            `💬 Quotes received: ${quotes.count ?? 0}`,
            `🔍 Searches: ${searches.count ?? 0}`,
            `🧾 Orders: ${orders.count ?? 0}`,
            `🆕 New bot contacts: ${contacts.count ?? 0}`,
        ].join('\n');
    }
    catch {
        return 'Stats unavailable right now.';
    }
}
