"use strict";
// Audit logging for the payment flow. Logging must NEVER break the payment
// path: every failure mode (missing env, DB down, bad data) is swallowed and
// only reported to the server console.
//
// Events recorded (event_type / outcome):
//   bid_rejected        · validation or auction-rule rejection
//   payment_initiated   · Paynow accepted the EcoCash initiation
//   payment_init_failed · Paynow refused / unreachable
//   payment_confirmed   · Paynow reported the transaction paid
//   payment_pending     · still awaiting the payer's PIN
//   webhook_rejected    · invalid hash, replay, poll mismatch, unknown ref
//   activation_failed   · paid but the #1 takeover insert failed
//   activation          · #1 takeover completed
Object.defineProperty(exports, "__esModule", { value: true });
exports.logPaymentEvent = logPaymentEvent;
const crypto_1 = require("crypto");
const supabase_server_js_1 = require("./supabase-server.js");
// Best-effort client IP behind Vercel's proxy.
function clientIp(req) {
    const h = req.headers;
    return (h.get('x-real-ip') ||
        h.get('cf-connecting-ip') ||
        (h.get('x-forwarded-for') || '').split(',')[0].trim() ||
        '');
}
// IPs are hashed — an audit log shouldn't become a PII liability of its own.
function hashIp(ip) {
    if (!ip)
        return '';
    const secret = process.env.BUSINESS_AUTH_SECRET || 'wa-directory-ip-hash';
    return (0, crypto_1.createHash)('sha256').update(`${secret}:${ip}`).digest('hex').slice(0, 32);
}
async function logPaymentEvent(input) {
    try {
        const req = input.request;
        const ip = req ? hashIp(clientIp(req)) : null;
        const ua = req ? req.headers.get('user-agent') || null : null;
        const { error } = await (0, supabase_server_js_1.getSupabase)().from('payment_events').insert({
            bid_id: input.bidId || null,
            business_id: input.businessId || null,
            event_type: input.eventType,
            outcome: input.outcome || 'ok',
            detail: input.detail || {},
            ip_hash: ip,
            user_agent: ua,
        });
        if (error) {
            console.error('[payment-events] insert failed:', error.message);
        }
    }
    catch (err) {
        console.error('[payment-events] logging failed:', err instanceof Error ? err.message : err);
    }
}
