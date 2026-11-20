"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCached = getCached;
exports.setCached = setCached;
const supabase_server_js_1 = require("./supabase-server.js");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
async function getCached(key, ttlMs = CACHE_TTL_MS) {
    try {
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('ai_cache')
            .select('result, created_at')
            .eq('cache_key', key)
            .maybeSingle();
        if (!data)
            return null;
        const age = Date.now() - new Date(data.created_at).getTime();
        if (age > ttlMs)
            return null;
        return data.result;
    }
    catch {
        return null;
    }
}
async function setCached(key, value) {
    try {
        await (0, supabase_server_js_1.getSupabase)()
            .from('ai_cache')
            // created_at must be rewritten explicitly: an upsert that omits it keeps
            // the original timestamp, so an expired row would stay expired forever
            // and regenerate on every request instead of once every 7 days.
            .upsert({ cache_key: key, result: value, created_at: new Date().toISOString() }, { onConflict: 'cache_key' });
    }
    catch {
        // cache is best-effort; never block the request on it
    }
}
