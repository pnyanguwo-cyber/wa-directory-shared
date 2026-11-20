"use strict";
// Minimal Paynow Zimbabwe client — EcoCash mobile transactions only.
// Implements the documented protocol (developers.paynow.co.zw):
//   • initiate a remote (mobile) transaction: POST urlencoded fields to
//     https://www.paynow.co.zw/interface/remotetransaction
//   • hash = SHA512(concat of raw field values in order + integration key
//     in lowercase), uppercase hex
//   • responses are urlencoded key=value pairs; verify the response hash
//   • status is checked by POSTing to the returned pollurl
//
// Only EcoCash is enabled on this integration — the mobile method is pinned
// to 'ecocash'.
Object.defineProperty(exports, "__esModule", { value: true });
exports.paynowConfigured = paynowConfigured;
exports.verifyHash = verifyHash;
exports.parseUrlencoded = parseUrlencoded;
exports.normalizeEcoCashPhone = normalizeEcoCashPhone;
exports.isEconetNumber = isEconetNumber;
exports.initiateEcoCashPayment = initiateEcoCashPayment;
exports.pollTransactionStatus = pollTransactionStatus;
const crypto_1 = require("crypto");
const phone_js_1 = require("./phone.js");
const REMOTE_TRANSACTION_URL = 'https://www.paynow.co.zw/interface/remotetransaction';
function config() {
    const id = process.env.PAYNOW_INTEGRATION_ID;
    const key = process.env.PAYNOW_INTEGRATION_KEY;
    if (!id || !key)
        return null;
    return { id, key };
}
function paynowConfigured() {
    return config() !== null;
}
function generateHash(values, integrationKey) {
    let string = '';
    for (const key of Object.keys(values)) {
        if (key === 'hash')
            continue;
        string += values[key];
    }
    string += integrationKey.toLowerCase();
    return (0, crypto_1.createHash)('sha512').update(string).digest('hex').toUpperCase();
}
function verifyHash(values, integrationKey) {
    if (!values.hash)
        return false;
    return values.hash === generateHash(values, integrationKey);
}
// Paynow answers with an application/x-www-form-urlencoded body. Values were
// urlencoded by us on the way in; decode with + as space, like the SDK does.
function parseUrlencoded(body) {
    const out = {};
    for (const pair of body.split('&')) {
        const idx = pair.indexOf('=');
        if (idx < 0)
            continue;
        const k = decodeURIComponent(pair.slice(0, idx).replace(/\+/g, '%20'));
        const v = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, '%20'));
        out[k] = v;
    }
    return out;
}
// Normalize a Zimbabwean EcoCash number to what Paynow expects (077… / 078… / 071…).
function normalizeEcoCashPhone(raw) {
    let digits = (0, phone_js_1.digitsOnly)(raw);
    if (digits.startsWith('263'))
        digits = '0' + digits.slice(3);
    else if (!digits.startsWith('0') && digits.length === 9)
        digits = '0' + digits;
    return digits;
}
function isEconetNumber(phone) {
    const d = normalizeEcoCashPhone(phone);
    // 071 / 077 / 078 prefixes (Econet Wireless) — mobile EcoCash only.
    return /^0(71|77|78)\d{7}$/.test(d);
}
async function postForm(url, data) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(data).toString(),
    });
    if (!res.ok)
        throw new Error(`Paynow request failed (${res.status})`);
    return res.text();
}
// Initiate an EcoCash push: the phone gets a prompt, they enter their PIN.
async function initiateEcoCashPayment(opts) {
    const cfg = config();
    if (!cfg)
        return { ok: false, error: 'Payments are not configured yet. Please try again later.' };
    const phone = normalizeEcoCashPhone(opts.phone);
    if (!isEconetNumber(phone)) {
        return { ok: false, error: 'Please use a valid Econet EcoCash number (071…, 077… or 078…).' };
    }
    const data = {
        resulturl: opts.resultUrl || '',
        returnurl: opts.returnUrl || '',
        reference: opts.reference,
        amount: opts.amount.toFixed(2),
        id: cfg.id,
        additionalinfo: opts.additionalInfo || '',
        authemail: opts.email || 'infinitymetersolutions@gmail.com',
        phone,
        method: 'ecocash',
        status: 'Message',
    };
    for (const key of Object.keys(data))
        data[key] = encodeURI(data[key]);
    data.hash = generateHash(data, cfg.key);
    try {
        const body = await postForm(REMOTE_TRANSACTION_URL, data);
        const parsed = parseUrlencoded(body);
        if (!parsed.status || parsed.status.toLowerCase() === 'error') {
            return { ok: false, error: parsed.error || 'Paynow rejected the payment request.' };
        }
        if (!verifyHash(parsed, cfg.key)) {
            return { ok: false, error: 'Payment verification failed.' };
        }
        return {
            ok: true,
            instructions: parsed.instructions,
            pollUrl: parsed.pollurl,
            paynowReference: parsed.paynowreference,
            redirectUrl: parsed.browserurl,
        };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Could not reach Paynow.' };
    }
}
// Ask Paynow whether a transaction was paid.
async function pollTransactionStatus(pollUrl) {
    const cfg = config();
    if (!cfg)
        return { ok: false, error: 'Payments are not configured.', status: 'error', paid: false };
    try {
        const body = await postForm(pollUrl, {});
        const parsed = parseUrlencoded(body);
        if (!parsed.status)
            return { ok: false, error: 'Empty status response.', status: 'error', paid: false };
        if (parsed.status.toLowerCase() !== 'error' && !verifyHash(parsed, cfg.key)) {
            return { ok: false, error: 'Status verification failed.', status: 'error', paid: false };
        }
        const status = parsed.status || 'unknown';
        const paid = status.toLowerCase() === 'paid' || status.toLowerCase() === 'awaiting delivery';
        return { ok: true, status, paid, paynowReference: parsed.paynowreference };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Could not reach Paynow.', status: 'error', paid: false };
    }
}
