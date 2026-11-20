"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBotSetting = getBotSetting;
exports.setBotSetting = setBotSetting;
const supabase_server_js_1 = require("./supabase-server.js");
// bot_settings KV: the admin digest cursor, the dormant priority-supplier
// switch, and future small config values. Never throws — missing keys read
// as empty strings.
async function getBotSetting(key) {
    try {
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('bot_settings')
            .select('value')
            .eq('key', key)
            .maybeSingle();
        return data && typeof data.value === 'string' ? data.value : '';
    }
    catch {
        return '';
    }
}
async function setBotSetting(key, value) {
    try {
        await (0, supabase_server_js_1.getSupabase)()
            .from('bot_settings')
            .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        return true;
    }
    catch {
        return false;
    }
}
