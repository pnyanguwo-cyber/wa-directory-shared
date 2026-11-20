"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPLY_TTL_HOURS = void 0;
exports.createSupplyOrder = createSupplyOrder;
exports.getOrderByToken = getOrderByToken;
exports.getSupplyOrderById = getSupplyOrderById;
exports.recordOrderOpen = recordOrderOpen;
exports.claimSupplyOrder = claimSupplyOrder;
exports.listOrdersForBusiness = listOrdersForBusiness;
exports.listOrdersForBuyer = listOrdersForBuyer;
exports.sweepStaleOrders = sweepStaleOrders;
exports.orderStats = orderStats;
const supabase_server_js_1 = require("./supabase-server.js");
const node_crypto_1 = __importDefault(require("node:crypto"));
exports.SUPPLY_TTL_HOURS = 24;
const SUPPLY_COLUMNS = 'id, group_id, token, biz_id, biz_name, buyer_phone, lines, note, city, status, clicks, pushed_via, trace, created_at, closed_at';
function drawToken() {
    // 6 chars from the unambiguous base32-ish alphabet (no 0/O/1/L/I).
    const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    let out = '';
    for (let i = 0; i < 6; i++)
        out += alphabet[node_crypto_1.default.randomInt(alphabet.length)];
    return out;
}
/** Create one supplier slice. Retries on the (rare) token collision. */
async function createSupplyOrder(fields) {
    const sb = (0, supabase_server_js_1.getSupabase)();
    for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await sb
            .from('supply_orders')
            .insert({
            group_id: fields.group_id || '',
            token: drawToken(),
            biz_id: fields.biz_id || null,
            biz_name: fields.biz_name,
            buyer_phone: fields.buyer_phone,
            lines: fields.lines,
            note: fields.note || '',
            city: fields.city || '',
            pushed_via: fields.pushed_via || '',
            trace: [],
        })
            .select(SUPPLY_COLUMNS)
            .maybeSingle();
        if (!error && data)
            return data;
        // 23505 = unique violation on token — redraw and retry.
        if (error && !String(error.message).includes('duplicate key')) {
            console.error('[supply-orders] insert failed:', error.message);
            return null;
        }
    }
    return null;
}
async function getOrderByToken(token) {
    const { data } = await (0, supabase_server_js_1.getSupabase)()
        .from('supply_orders')
        .select(SUPPLY_COLUMNS)
        .eq('token', token)
        .maybeSingle();
    return data || null;
}
async function getSupplyOrderById(id) {
    const { data } = await (0, supabase_server_js_1.getSupabase)()
        .from('supply_orders')
        .select(SUPPLY_COLUMNS)
        .eq('id', id)
        .maybeSingle();
    return data || null;
}
/** wa.me short link opened: count it and promote open → sent (never demote). */
async function recordOrderOpen(token) {
    const row = await getOrderByToken(token);
    if (!row)
        return null;
    const next = {
        clicks: (row.clicks || 0) + 1,
        trace: [...(row.trace || []), { event: 'opened', at: new Date().toISOString() }],
    };
    if (row.status === 'open')
        next.status = 'sent';
    const { data, error } = await (0, supabase_server_js_1.getSupabase)()
        .from('supply_orders')
        .update(next)
        .eq('id', row.id)
        .select(SUPPLY_COLUMNS)
        .maybeSingle();
    if (error) {
        console.error('[supply-orders] open update failed:', error.message);
        return row;
    }
    return data || row;
}
/** Supplier accepted / contacted the buyer: claimed is sticky. */
async function claimSupplyOrder(id) {
    const { data } = await (0, supabase_server_js_1.getSupabase)()
        .from('supply_orders')
        .update({
        status: 'claimed',
        closed_at: null,
        trace: [{ event: 'claimed', at: new Date().toISOString() }],
    })
        .eq('id', id)
        .in('status', ['open', 'sent'])
        .select(SUPPLY_COLUMNS)
        .maybeSingle();
    return data || null;
}
/** Open orders owed by one supplier, newest first. */
async function listOrdersForBusiness(bizId, limit = 5) {
    const { data } = await (0, supabase_server_js_1.getSupabase)()
        .from('supply_orders')
        .select(SUPPLY_COLUMNS)
        .eq('biz_id', bizId)
        .in('status', ['open', 'sent'])
        .order('created_at', { ascending: false })
        .limit(limit);
    return data || [];
}
/** Open orders a buyer owns (buy-side view; claimed ones stay until TTL). */
async function listOrdersForBuyer(buyerPhone, limit = 5) {
    const { data } = await (0, supabase_server_js_1.getSupabase)()
        .from('supply_orders')
        .select(SUPPLY_COLUMNS)
        .eq('buyer_phone', buyerPhone)
        .in('status', ['open', 'sent', 'claimed'])
        .order('created_at', { ascending: false })
        .limit(limit);
    return data || [];
}
/** TTL sweep: stale open/sent rows → closed. Returns swept count. */
async function sweepStaleOrders() {
    const cutoff = new Date(Date.now() - exports.SUPPLY_TTL_HOURS * 3600_000).toISOString();
    const { data, error } = await (0, supabase_server_js_1.getSupabase)()
        .from('supply_orders')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .in('status', ['open', 'sent'])
        .lt('created_at', cutoff)
        .select('id');
    if (error) {
        console.error('[supply-orders] sweep failed:', error.message);
        return 0;
    }
    return (data || []).length;
}
/** Small counters for the admin stats line. */
async function orderStats(sinceHours = 168) {
    const since = new Date(Date.now() - sinceHours * 3600_000).toISOString();
    const { data } = await (0, supabase_server_js_1.getSupabase)()
        .from('supply_orders')
        .select('status, lines, created_at')
        .gte('created_at', since)
        .limit(500);
    const rows = data || [];
    let usd = 0;
    for (const r of rows) {
        for (const l of r.lines || [])
            usd += (l.price || 0) * (l.qty || 0);
    }
    return {
        orders: rows.length,
        claimed: rows.filter(r => r.status === 'claimed' || r.status === 'closed').length,
        usd: Math.round(usd * 100) / 100,
    };
}
