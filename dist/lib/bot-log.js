"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logBotMessage = logBotMessage;
exports.logBotSearch = logBotSearch;
exports.pruneBotMessages = pruneBotMessages;
exports.transcriptCallers = transcriptCallers;
exports.transcriptFor = transcriptFor;
const supabase_server_js_1 = require("./supabase-server.js");
// ── S16 logging engines ──────────────────────────────────────────────────
// bot_messages: word-for-word bot conversation transcripts (60-day trim
// happens via the migration's prune_bot_messages(), fired from the hourly
// cron). bot_searches: one row per user search — the admin "demand radar".
// Both fail open: logging must never break or delay a bot reply.
async function logBotMessage(phone, dir, kind, body) {
    if (!phone)
        return;
    try {
        await (0, supabase_server_js_1.getSupabase)().from('bot_messages').insert({
            phone,
            dir,
            kind: kind.slice(0, 20) || 'text',
            body: (body || '').slice(0, 3500),
        });
    }
    catch {
        // best-effort
    }
}
async function logBotSearch(phone, term, city) {
    try {
        await (0, supabase_server_js_1.getSupabase)().from('bot_searches').insert({
            phone: phone || '',
            term: (term || '').slice(0, 200),
            city: city || '',
        });
    }
    catch {
        // best-effort
    }
}
async function pruneBotMessages() {
    try {
        await (0, supabase_server_js_1.getSupabase)().rpc('prune_bot_messages');
    }
    catch {
        // best-effort
    }
}
/** List of callers with transcript activity in the last N days (default 14). */
async function transcriptCallers(days = 14) {
    try {
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('bot_messages')
            .select('phone, created_at')
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(2000);
        const byPhone = new Map();
        for (const row of data || []) {
            const cur = byPhone.get(row.phone);
            if (cur)
                cur.messages++;
            else
                byPhone.set(row.phone, { last_at: row.created_at, messages: 1 });
        }
        return [...byPhone.entries()].map(([phone, v]) => ({ phone, ...v })).slice(0, 200);
    }
    catch {
        return [];
    }
}
/** Word-for-word conversation for one caller, oldest first. */
async function transcriptFor(phone, limit = 400) {
    try {
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('bot_messages')
            .select('dir, kind, body, created_at')
            .eq('phone', phone)
            .order('created_at', { ascending: false })
            .limit(limit);
        return (data || []).reverse();
    }
    catch {
        return [];
    }
}
