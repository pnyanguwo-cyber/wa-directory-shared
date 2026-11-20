"use strict";
/**
 * Admin WhatsApp notices with up to three quick-reply buttons.
 *
 * WhatsApp's button message carries at most three reply buttons; everything
 * else stays a typed command. Button ids are exactly the command we would have
 * typed (`verify <name>`, `trial <name>`, `pending`), so a tap runs the same
 * handler as the text - no second code path to keep in sync.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pendingVerificationButtons = pendingVerificationButtons;
exports.reviewRequestButtons = reviewRequestButtons;
exports.sendAdminNotice = sendAdminNotice;
exports.submissionNoticeBody = submissionNoticeBody;
const whatsapp_js_1 = require("./whatsapp.js");
const site_url_js_1 = require("./site-url.js");
/**
 * The three things an admin does with a freshly submitted listing.
 *
 * `verify <name>` carries no day count on purpose: the bot then checks whether
 * the owner asked for the 90-day free trial and starts that trial, otherwise
 * it grants the usual 30 days. Typing `verify <name> 30` would force the
 * 30-day grant and leave a trial request pending.
 */
function pendingVerificationButtons(businessName) {
    const name = businessName.trim();
    return [
        name
            ? { id: `verify ${name}`, title: '✅ Approve' }
            : { id: 'pending', title: '✅ Approve' },
        name
            ? { id: `trial ${name}`, title: '🆓 90-day trial' }
            : { id: 'pending', title: '🆓 90-day trial' },
        { id: 'pending', title: '🕵️ Pending list' },
    ];
}
/**
 * Same actions for a location/category request raised by a submission.
 *
 * When the submission asked for a category, the middle button is "Connect to":
 * many requests are just another name for a category we already have, and
 * approving them as new ones splits the directory. Three buttons is the
 * WhatsApp maximum, so the pending list gives way to the connect action when
 * it applies.
 */
function reviewRequestButtons(businessName, hasCategoryRequest = false) {
    const name = businessName.trim();
    const tail = name ? [{ id: `verify ${name}`, title: '✅ Approve' }] : [];
    if (hasCategoryRequest) {
        return [
            { id: 'requests', title: '🗂 Requests' },
            { id: 'connect req', title: '🔗 Connect to' },
            ...tail,
        ];
    }
    return [
        { id: 'requests', title: '🗂 Requests' },
        { id: 'pending', title: '🕵️ Pending list' },
        ...tail,
    ];
}
/**
 * Send an admin notice as buttons, falling back to plain text (with the
 * commands spelled out) when Meta rejects the interactive payload.
 */
async function sendAdminNotice(phone, body, buttons = []) {
    if (!phone)
        return;
    if (!buttons.length) {
        await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, body);
        return;
    }
    try {
        await (0, whatsapp_js_1.sendInteractiveButtons)(phone, body, buttons);
    }
    catch (err) {
        console.error('[admin-notice] buttons failed, sending text:', err);
        await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, body);
    }
}
/** Body for a new submission, with the dashboard link kept in the text. */
function submissionNoticeBody(fields) {
    return [
        fields.title,
        '',
        `Name: ${fields.name}`,
        `ID: ${fields.code}`,
        `Category: ${fields.category || '—'}`,
        `Location: ${fields.location || 'Zimbabwe (whole country)'}`,
        `Phone: ${fields.phone}`,
        ...(fields.extra || []),
        '',
        '✅ Approve = 90-day trial if they asked for one, otherwise 30 days.',
        '🆓 90-day trial = start the full trial now.',
        'Or reply *pending* then *verify 1* / *verify 1 30*.',
        `Approve: ${site_url_js_1.SITE_URL}/admin`,
    ].join('\n');
}
