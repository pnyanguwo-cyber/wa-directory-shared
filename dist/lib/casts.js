"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHUNK_PER_RUN = exports.SYNC_MAX_SENDS = exports.MAX_AUDIENCE = void 0;
exports.scheduledForIso = scheduledForIso;
exports.parseCastSpec = parseCastSpec;
exports.adminNumbers = adminNumbers;
exports.broadcastAudience = broadcastAudience;
exports.resolveCastAudience = resolveCastAudience;
exports.enqueueCast = enqueueCast;
exports.sendCastChunk = sendCastChunk;
exports.releaseDueCasts = releaseDueCasts;
exports.renderCastsList = renderCastsList;
exports.cancelCast = cancelCast;
const supabase_server_js_1 = require("./supabase-server.js");
const bot_settings_js_1 = require("./bot-settings.js");
const whatsapp_js_1 = require("./whatsapp.js");
const bot_log_js_1 = require("./bot-log.js");
const phone_js_1 = require("./phone.js");
const needs_js_1 = require("./needs.js");
const zimbabwe_locations_js_1 = require("../data/zimbabwe-locations.js");
const categories_js_1 = require("../data/categories.js");
exports.MAX_AUDIENCE = 1000;
exports.SYNC_MAX_SENDS = 400;
exports.CHUNK_PER_RUN = 100;
// ── Pure parsing ──────────────────────────────────────────────────────────
function categoryNameHits(token) {
    const t = token.toLowerCase().replace(/[^a-z]/g, '');
    if (!t)
        return [];
    return categories_js_1.categories
        .filter(c => c.name.toLowerCase().replace(/[^a-z]/g, '').includes(t) ||
        (c.keywords || []).some(k => k.toLowerCase().includes(t)))
        .map(c => c.name);
}
function isFilterToken(token) {
    const t = token.toLowerCase().replace(/[^a-z]/g, '');
    if (!t)
        return false;
    if (zimbabwe_locations_js_1.zimbabweCities.some(c => c.name.toLowerCase() === t))
        return true;
    if (categoryNameHits(token).length > 0)
        return true;
    return false;
}
// Harare wall-clock (today|tomorrow HH[:]MM [am|pm]) → UTC ISO. CAT is UTC+2
// with no DST, so the mapping is a fixed -2h shift.
function scheduledForIso(when, h, m, ampm) {
    let hour = h;
    if (ampm)
        hour = (h % 12) + (ampm.toLowerCase() === 'pm' ? 12 : 0);
    const dayStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    let target = dayStart + (hour * 60 + m - 120) * 60000;
    if (when === 'tomorrow' || target <= Date.now())
        target += 24 * 3600000;
    return new Date(target).toISOString();
}
function parseCastSpec(arg) {
    const arg_ = (arg || '').trim();
    if (!arg_)
        return { spec: null, error: 'Add a message: *cast your announcement here*.' };
    let segment = 'all';
    let rest = arg_;
    const segM = rest.match(/^(all|owners|buyers)\s+([\s\S]+)$/i);
    if (segM) {
        segment = segM[1].toLowerCase();
        rest = segM[2].trim();
    }
    let filter = '';
    // Scheduled form: today|tonight|tomorrow [+ at] HH[:]MM [am|pm] <body>.
    // Also allowed after a city/category filter token ("owners harare today 9am …").
    const TIME_ERR = 'That time looks off - use e.g. *today 15:30* or *tomorrow 9am*.';
    const trySchedule = (text) => {
        const schedM = text.match(/^(today|tonight|tomorrow)(?:\s+at)?\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?:\s+([\s\S]+))?$/i);
        if (!schedM)
            return null;
        const h = Number(schedM[2]);
        const m = Number(schedM[3] || 0);
        const body = (schedM[5] || '').trim();
        if (h < 0 || h > 23 || m > 59)
            return { badTime: true };
        if (!body)
            return null;
        return {
            spec: {
                segment,
                filter,
                body,
                scheduledFor: scheduledForIso(schedM[1].toLowerCase(), h, m, schedM[4]),
            },
            rest: body,
        };
    };
    const first = trySchedule(rest);
    if (first) {
        if ('badTime' in first)
            return { spec: null, error: TIME_ERR };
        return { spec: first.spec };
    }
    if (/^(today|tonight|tomorrow)$/i.test(rest)) {
        return { spec: null, error: 'Add a time and message: *cast owners today 15:30 <message>*.' };
    }
    // Unscheduled: an optional first token that resolves to a city or category
    // becomes the filter; anything unresolved stays part of the message.
    const tokens = rest.split(/\s+/);
    if (tokens.length >= 2 && isFilterToken(tokens[0])) {
        filter = tokens[0];
        rest = rest.slice(tokens[0].length).trim();
        const second = trySchedule(rest);
        if (second) {
            if ('badTime' in second)
                return { spec: null, error: TIME_ERR };
            return { spec: second.spec };
        }
    }
    if (!rest)
        return { spec: null, error: 'Add the message: *cast owners harare come visit our stand*.' };
    return { spec: { segment, filter, body: rest } };
}
// ── Audience resolution ───────────────────────────────────────────────────
async function adminNumbers() {
    const env = (process.env.ADMIN_WHATSAPP || '')
        .split(',')
        .map(p => (0, phone_js_1.digitsOnly)(p.trim()))
        .filter(Boolean);
    let extra = [];
    const raw = await (0, bot_settings_js_1.getBotSetting)('admin_allowlist');
    if (raw) {
        try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr))
                extra = arr.map(p => (0, phone_js_1.digitsOnly)(String(p))).filter(Boolean);
        }
        catch {
            // malformed allowlist — env numbers still apply
        }
    }
    return [...new Set([...env, ...extra])];
}
// Base audience: numbers with an inbound message in the last 24h (Meta
// session window open, so replies are free-form and free), minus opted-out
// contacts and bot admins.
async function broadcastAudience() {
    try {
        const since = new Date(Date.now() - 24 * 3600000).toISOString();
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('bot_messages')
            .select('phone')
            .eq('dir', 'in')
            .gte('created_at', since)
            .limit(2000);
        const phones = [...new Set((data || []).map(r => r.phone).filter(Boolean))];
        if (!phones.length)
            return [];
        const { data: contacts } = await (0, supabase_server_js_1.getSupabase)()
            .from('bot_contacts')
            .select('phone, opted_out')
            .in('phone', phones);
        const optedOut = new Set((contacts || [])
            .filter(c => c.opted_out)
            .map(c => c.phone));
        const admins = new Set(await adminNumbers());
        return phones.filter(p => !optedOut.has(p) && !admins.has((0, phone_js_1.digitsOnly)(p)));
    }
    catch {
        return [];
    }
}
// Apply the segment on top of the base audience. Owners come from the
// businesses table (digits of `phone`); the filter token matches city or
// category text. Result capped at MAX_AUDIENCE.
async function resolveCastAudience(spec) {
    const base = await broadcastAudience();
    if (spec.segment === 'all' && !spec.filter)
        return base.slice(0, exports.MAX_AUDIENCE);
    const { data: biz } = await (0, supabase_server_js_1.getSupabase)()
        .from('businesses')
        .select('phone, city, category');
    const ownerRows = (biz || [])
        .filter(b => b.phone);
    const ownerDigits = ownerRows.map(b => (0, phone_js_1.digitsOnly)(b.phone));
    const ownerSet = new Set(ownerDigits);
    if (spec.segment === 'buyers')
        return base.filter(p => !ownerSet.has((0, phone_js_1.digitsOnly)(p))).slice(0, exports.MAX_AUDIENCE);
    // owners — with an optional city/category filter
    const f = (spec.filter || '').toLowerCase();
    const catHits = f ? categoryNameHits(f) : [];
    let ownerList = ownerDigits;
    if (f) {
        const wanted = new Set([...catHits.map(c => c.toLowerCase()), f]);
        const filtered = ownerRows.filter(b => {
            const city = (b.city || '').toLowerCase();
            const cat = (b.category || '').toLowerCase();
            if (city.includes(f))
                return true;
            return [...wanted].some(w => w && cat.includes(w));
        });
        ownerList = filtered.map(b => (0, phone_js_1.digitsOnly)(b.phone));
    }
    return base.filter(p => ownerList.includes((0, phone_js_1.digitsOnly)(p))).slice(0, exports.MAX_AUDIENCE);
}
// ── Queue + sending ───────────────────────────────────────────────────────
async function enqueueCast(spec, createdBy, scheduledFor, audience) {
    try {
        const { data, error } = await (0, supabase_server_js_1.getSupabase)()
            .from('bot_casts')
            .insert({
            body: spec.body,
            segment: spec.segment,
            filter: spec.filter || '',
            status: scheduledFor ? 'scheduled' : 'sending',
            scheduled_for: scheduledFor,
            created_by: createdBy,
            audience,
        })
            .select('id')
            .single();
        if (error || !data)
            return null;
        return Number(data.id);
    }
    catch {
        return null;
    }
}
// Send one slice of a materialized cast, guarded by the cursor: the DB
// update only lands when `cursor` still equals the value this worker read,
// so a second worker (hourly cron racing the webhook, or two cron runs)
// aborts instead of double-sending or corrupting progress.
async function sendCastChunk(castId, maxSends = exports.CHUNK_PER_RUN) {
    const supabase = (0, supabase_server_js_1.getSupabase)();
    const { data: row } = await supabase.from('bot_casts').select('*').eq('id', castId).maybeSingle();
    if (!row)
        return { ok: false, done: true, error: 'cast not found', castId };
    if (row.status === 'sent' || row.status === 'cancelled' || row.status === 'failed') {
        return { ok: true, done: true, sent: row.sent_count || 0, failed: row.failed_count || 0, castId };
    }
    const audience = Array.isArray(row.audience) ? row.audience : [];
    if (!audience.length) {
        await supabase
            .from('bot_casts')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', castId);
        return { ok: false, done: true, error: 'empty audience', castId };
    }
    // Claim scheduled → sending before the first send.
    if (row.status === 'scheduled') {
        const claim = await supabase
            .from('bot_casts')
            .update({ status: 'sending', updated_at: new Date().toISOString() })
            .eq('id', castId)
            .eq('status', 'scheduled')
            .select('id');
        if (!claim.data || claim.data.length === 0) {
            return { ok: true, done: false, error: 'claimed elsewhere', castId };
        }
    }
    const start = Number(row.cursor) || 0;
    const slice = audience.slice(start, start + maxSends);
    let sent = 0;
    let failed = 0;
    for (const phone of slice) {
        try {
            await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, row.body);
            (0, bot_log_js_1.logBotMessage)(phone, 'out', 'text', row.body).catch(() => { });
            sent++;
        }
        catch {
            failed++;
        }
    }
    const next = start + slice.length;
    const finished = next >= audience.length;
    const patch = {
        cursor: next,
        sent_count: (Number(row.sent_count) || 0) + sent,
        failed_count: (Number(row.failed_count) || 0) + failed,
        updated_at: new Date().toISOString(),
    };
    if (finished)
        patch.status = 'sent';
    const guard = await supabase
        .from('bot_casts')
        .update(patch)
        .eq('id', castId)
        .eq('cursor', start)
        .select('id');
    if (!guard.data || guard.data.length === 0) {
        return { ok: true, done: false, error: 'advanced elsewhere', castId };
    }
    if (finished && row.created_by) {
        const segLabel = row.segment === 'all' ? 'everyone' : `${row.segment}${row.filter ? ` (${row.filter})` : ''}`;
        const lines = [
            `📣 *Cast #${castId} delivered*`,
            `✅ Sent: ${(Number(row.sent_count) || 0) + sent}`,
            (Number(row.failed_count) || 0) + failed ? `⚠️ Failed: ${(Number(row.failed_count) || 0) + failed}` : '',
            `👥 Segment: ${segLabel}`,
        ].filter(Boolean);
        await (0, whatsapp_js_1.sendWhatsAppMessage)(row.created_by, lines.join('\n'));
        (0, bot_log_js_1.logBotMessage)(row.created_by, 'out', 'text', lines.join('\n')).catch(() => { });
    }
    return { ok: true, done: finished, sent, failed, castId };
}
// Hourly-cron driver: drain stale in-flight casts, then release scheduled
// ones whose time has come (audience materialized at release time — the 24h
// window can only be judged then). One CHUNK_PER_RUN slice each.
async function releaseDueCasts() {
    const supabase = (0, supabase_server_js_1.getSupabase)();
    let advanced = 0;
    const stale = new Date(Date.now() - 5 * 60000).toISOString();
    const { data: sending } = await supabase
        .from('bot_casts')
        .select('id')
        .eq('status', 'sending')
        .lt('updated_at', stale)
        .limit(10);
    for (const r of sending || []) {
        await sendCastChunk(r.id, exports.CHUNK_PER_RUN);
        advanced++;
    }
    const now = new Date().toISOString();
    const { data: due } = await supabase
        .from('bot_casts')
        .select('id')
        .eq('status', 'scheduled')
        .lte('scheduled_for', now)
        .limit(10);
    for (const r of due || []) {
        const { data: row } = await supabase
            .from('bot_casts')
            .select('segment, filter')
            .eq('id', r.id)
            .maybeSingle();
        if (!row)
            continue;
        const audience = await resolveCastAudience({ segment: row.segment, filter: row.filter || '' });
        await supabase
            .from('bot_casts')
            .update({ audience, updated_at: new Date().toISOString() })
            .eq('id', r.id)
            .eq('status', 'scheduled');
        await sendCastChunk(r.id, exports.CHUNK_PER_RUN);
        advanced++;
    }
    return advanced;
}
// ── Admin listing + cancel ────────────────────────────────────────────────
async function renderCastsList() {
    try {
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('bot_casts')
            .select('id, segment, filter, status, scheduled_for, sent_count, failed_count')
            .order('id', { ascending: false })
            .limit(15);
        const rows = data || [];
        if (!rows.length) {
            return 'No casts yet - start one with *cast your announcement*.';
        }
        const lines = ['📣 *Recent casts*', ''];
        for (const r of rows) {
            const seg = r.segment === 'all' ? 'everyone' : `${r.segment}${r.filter ? ` ${r.filter}` : ''}`;
            const when = r.status === 'scheduled' && r.scheduled_for
                ? `⏰ ${(0, needs_js_1.fmtHarare)(r.scheduled_for, true)}`
                : r.status === 'sent'
                    ? `✅${r.sent_count || 0}${r.failed_count ? ` ⚠️${r.failed_count}` : ''}`
                    : r.status === 'sending'
                        ? '⏳ sending'
                        : r.status === 'failed'
                            ? '❌ failed'
                            : '✖️ cancelled';
            lines.push(`#${r.id} · ${seg} · ${when}`);
        }
        lines.push('', 'Cancel with *cast cancel <id>*.');
        return lines.join('\n');
    }
    catch {
        return 'Could not load casts right now - try again shortly.';
    }
}
async function cancelCast(id) {
    try {
        const res = await (0, supabase_server_js_1.getSupabase)()
            .from('bot_casts')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', id)
            .in('status', ['scheduled', 'sending'])
            .select('id');
        return !!res.data && res.data.length > 0;
    }
    catch {
        return false;
    }
}
