"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClient = getClient;
const supabase_js_1 = require("@supabase/supabase-js");
function getClient() {
    return (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
