"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signBusinessToken = signBusinessToken;
exports.verifyBusinessToken = verifyBusinessToken;
exports.setBusinessSession = setBusinessSession;
exports.clearBusinessSession = clearBusinessSession;
exports.getBusinessId = getBusinessId;
exports.normalizePhone = normalizePhone;
// Business authentication - shared by webapp and chatbot.
// Cookie handling is injected by the host (webapp uses next/headers, chatbot uses custom storage).
const node_crypto_1 = require("node:crypto");
const phone_js_1 = require("./phone.js");
const COOKIE = 'business_session';
function secret() {
    return process.env.BUSINESS_AUTH_SECRET || null;
}
function normalizePhone(phone) {
    return '+' + (0, phone_js_1.canonicalPhone)(phone);
}
function signBusinessToken(businessId) {
    const s = secret();
    if (!s)
        throw new Error('BUSINESS_AUTH_SECRET is not set');
    const payload = `${businessId}.${Date.now() + 30 * 24 * 60 * 60 * 1000}`;
    const sig = (0, node_crypto_1.createHmac)('sha256', s).update(payload).digest('base64url');
    return `${payload}.${sig}`;
}
function verifyBusinessToken(token) {
    try {
        const s = secret();
        if (!s)
            return null;
        const parts = token.split('.');
        if (parts.length !== 3)
            return null;
        const [businessId, expiry, sig] = parts;
        const expected = (0, node_crypto_1.createHmac)('sha256', s).update(`${businessId}.${expiry}`).digest('base64url');
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !(0, node_crypto_1.timingSafeEqual)(a, b))
            return null;
        if (Number(expiry) < Date.now())
            return null;
        return businessId;
    }
    catch {
        return null;
    }
}
function setBusinessSession(businessId, cookies) {
    const token = signBusinessToken(businessId);
    cookies?.set?.(COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
    });
}
function clearBusinessSession(cookies) {
    cookies?.delete?.(COOKIE);
}
function getBusinessId(cookies) {
    const token = cookies?.get?.(COOKIE);
    if (!token)
        return null;
    return verifyBusinessToken(token);
}
