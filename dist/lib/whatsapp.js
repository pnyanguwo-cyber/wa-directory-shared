"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setOutboundLogger = setOutboundLogger;
exports.sendWhatsAppMessage = sendWhatsAppMessage;
exports.markRead = markRead;
exports.sendLocationRequest = sendLocationRequest;
exports.sendContactCard = sendContactCard;
exports.sendReaction = sendReaction;
exports.sendCtaUrl = sendCtaUrl;
exports.sendInteractiveList = sendInteractiveList;
exports.sendInteractiveButtons = sendInteractiveButtons;
exports.sendInteractiveImageCard = sendInteractiveImageCard;
exports.sendWhatsAppTemplate = sendWhatsAppTemplate;
exports.sendWhatsAppDocument = sendWhatsAppDocument;
exports.sendWhatsAppImage = sendWhatsAppImage;
exports.sendImageWithFallback = sendImageWithFallback;
const WHATSAPP_API = 'https://graph.facebook.com/v18.0';
let outboundLogger = null;
function setOutboundLogger(logger) {
    outboundLogger = logger;
}
function transcript(to, kind, body) {
    if (!outboundLogger || !to)
        return;
    try {
        outboundLogger(to, kind, body);
    }
    catch {
        // Transcript logging must never break a send.
    }
}
async function postToWhatsApp(phoneNumberId, accessToken, payload) {
    try {
        // Test mode: log instead of sending so message-flow changes can be
        // validated end-to-end without delivering anything to real users.
        if (process.env.WHATSAPP_DRY_RUN === '1') {
            const p = payload;
            console.log(`[whatsapp][dry-run] to=${p.to ?? '(n/a)'}\n${p.text?.body ?? JSON.stringify(payload)}`);
            return true;
        }
        const res = await fetch(`${WHATSAPP_API}/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.text();
            console.error('[whatsapp] Send failed:', err);
            return false;
        }
        return true;
    }
    catch (err) {
        console.error('[whatsapp] Network error:', err);
        return false;
    }
}
async function sendWhatsAppMessage(to, message, replyTo) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
        console.warn('[whatsapp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
        return false;
    }
    transcript(to, 'text', message);
    return postToWhatsApp(phoneNumberId, accessToken, {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
        ...(replyTo ? { context: { message_id: replyTo } } : {}),
    });
}
// Mark an inbound message as read (blue ticks), optionally lighting the
// composing indicator for ~30s or until the next outgoing message. Pure
// best-effort: failures are swallowed — never let cosmetics break a reply.
async function markRead(messageId, typing = false) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!messageId || !phoneNumberId || !accessToken)
        return;
    if (process.env.WHATSAPP_DRY_RUN === '1') {
        console.log(`[whatsapp][dry-run][read${typing ? '+typing' : ''}] id=${messageId}`);
        return;
    }
    try {
        const res = await fetch(`${WHATSAPP_API}/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: messageId,
                ...(typing ? { typing_indicator: { type: 'text' } } : {}),
            }),
        });
        if (!res.ok)
            return;
    }
    catch {
        // Cosmetic only.
    }
}
// Native "share your location" prompt: one interactive message with the
// phone's location button. Falls back to a plain-text ask when the
// business account doesn't support the template type.
async function sendLocationRequest(to, body) {
    transcript(to, 'location_req', body);
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
        console.warn('[whatsapp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
        return;
    }
    const cleanBody = clip(body, 1024);
    if (process.env.WHATSAPP_DRY_RUN === '1') {
        console.log(`[whatsapp][dry-run][location_request] to=${to}\n${cleanBody}`);
        return;
    }
    const ok = await postToWhatsApp(phoneNumberId, accessToken, {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
            type: 'location_request_message',
            body: { text: cleanBody },
            action: { name: 'send_location' },
        },
    });
    if (!ok) {
        await postToWhatsApp(phoneNumberId, accessToken, {
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: `${cleanBody}\n\n(Please send your location, or type your town - e.g. *harare*.)` },
        });
    }
}
// vCard contact-card handoff (WhatsApp native "contacts" message). Used at
// need close so buyer and winning supplier can save each other with one tap.
async function sendContactCard(to, name, phone) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken || !to)
        return;
    const cleanPhone = `+${(phone || '').replace(/\D/g, '')}`;
    if (!cleanPhone || cleanPhone === '+')
        return;
    if (process.env.WHATSAPP_DRY_RUN === '1') {
        console.log(`[whatsapp][dry-run][contact] to=${to} ${name} ${cleanPhone}`);
        return;
    }
    try {
        await postToWhatsApp(phoneNumberId, accessToken, {
            messaging_product: 'whatsapp',
            to,
            type: 'contacts',
            contacts: [
                {
                    name: { formatted_name: name || 'Contact', first_name: (name || 'Contact').split(' ')[0] },
                    phones: [{ phone: cleanPhone, type: 'CELL' }],
                },
            ],
        });
    }
    catch {
        // best-effort handoff
    }
}
// React to one of the user's own messages (best-effort cosmetics).
async function sendReaction(to, messageId, emoji) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!messageId || !phoneNumberId || !accessToken)
        return;
    if (process.env.WHATSAPP_DRY_RUN === '1') {
        console.log(`[whatsapp][dry-run][reaction] to=${to} ${emoji} on ${messageId}`);
        return;
    }
    await postToWhatsApp(phoneNumberId, accessToken, {
        messaging_product: 'whatsapp',
        to,
        type: 'reaction',
        reaction: { message_id: messageId, emoji },
    });
}
// ── Interactive (WhatsApp native) messages ────────────────────────────────
// Cloud API limits: body 1024, list button label 20, up to 10 rows over all
// sections (row title 24, description 72), up to 3 reply buttons (title 20,
// id 256). Helpers clip every field so oversized data can still go out
// instead of erroring the whole send.
function clip(text, max) {
    const t = (text || '').trim();
    return t.length <= max ? t : t.slice(0, max - 1) + '…';
}
// Meta rejects an interactive message whose body is blank ("The parameter
// interactive.body.text is required"), so every body goes through this: an
// empty string becomes a neutral prompt instead of a failed send that the
// customer never sees.
const FALLBACK_BODY = 'Choose an option below.';
function bodyText(text, fallback = FALLBACK_BODY) {
    return clip(text, 1024) || fallback;
}
async function postInteractive(to, kind, interactive, bodyForLog, summaryForLog, replyTo) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
        console.warn('[whatsapp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
        return false;
    }
    if (process.env.WHATSAPP_DRY_RUN === '1') {
        console.log(`[whatsapp][dry-run][${kind}] to=${to} (${summaryForLog})\n${bodyForLog}`);
        return true;
    }
    return postToWhatsApp(phoneNumberId, accessToken, {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: { type: kind, ...interactive },
        ...(replyTo ? { context: { message_id: replyTo } } : {}),
    });
}
/**
 * CTA-URL message: body text with one native button that opens a link.
 * Some WhatsApp Business Accounts don't support cta_url yet (recent rollout),
 * so a failure degrades to plain text carrying the same (short) link.
 */
async function sendCtaUrl(to, body, displayText, url) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
        console.warn('[whatsapp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
        return;
    }
    const cleanBody = clip(body, 1024);
    transcript(to, 'cta', `${cleanBody}\n→ ${url}`);
    if (process.env.WHATSAPP_DRY_RUN === '1') {
        console.log(`[whatsapp][dry-run][cta_url] to=${to} [${clip(displayText, 25)}] → ${url}\n${cleanBody}`);
        return;
    }
    const ok = await postToWhatsApp(phoneNumberId, accessToken, {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
            type: 'cta_url',
            body: { text: cleanBody },
            action: {
                name: 'cta_url',
                parameters: { display_text: clip(displayText, 25), url },
            },
        },
    });
    if (!ok) {
        await postToWhatsApp(phoneNumberId, accessToken, {
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: `${cleanBody}\n\n💬 ${url}` },
        });
    }
}
/** List message: a body plus a button that opens tappable rows. */
async function sendInteractiveList(to, body, rows, buttonLabel = 'Choose a business', replyTo) {
    const safeRows = rows.slice(0, 10).map(r => ({
        id: clip(r.id, 200),
        title: clip(r.title, 24),
        description: r.description ? clip(r.description, 72) : undefined,
    }));
    transcript(to, 'list', `${body}\n↳ rows: ${safeRows.map(r => r.title).join(' | ')}`);
    await postInteractive(to, 'list', {
        body: { text: bodyText(body) },
        action: {
            button: clip(buttonLabel, 20),
            sections: [{ title: clip('Options', 24), rows: safeRows }],
        },
    }, bodyText(body), `${safeRows.length} rows: ${safeRows.map(r => `${r.id}: ${r.title}${r.description ? ` (${r.description})` : ''}`).join(' | ')}`, replyTo);
}
/** Button message: a body with up to three quick-reply buttons. */
async function sendInteractiveButtons(to, body, buttons, replyTo) {
    const safeButtons = buttons.slice(0, 3).map(b => ({
        type: 'reply',
        reply: { id: clip(b.id, 256), title: clip(b.title, 20) },
    }));
    if (safeButtons.length === 0) {
        await sendWhatsAppMessage(to, clip(body, 4096));
        return;
    }
    transcript(to, 'buttons', `${body}\n[${safeButtons.map(b => b.reply.title).join(' | ')}]`);
    await postInteractive(to, 'button', {
        body: { text: bodyText(body) },
        action: { buttons: safeButtons },
    }, bodyText(body), safeButtons.map(b => b.reply.id).join(','), replyTo);
}
/**
 * Product card: image + body + quick-reply buttons in ONE interactive
 * message, so the button always travels with the picture. Degrades to the
 * image/caption (then buttons) path when the interactive post fails.
 */
async function sendInteractiveImageCard(to, body, imageUrl, buttons) {
    const safeButtons = buttons.slice(0, 3).map(b => ({
        type: 'reply',
        reply: { id: clip(b.id, 256), title: clip(b.title, 20) },
    }));
    if (safeButtons.length === 0) {
        await sendImageWithFallback(to, imageUrl || '', clip(body, 1024));
        return;
    }
    const cleanBody = bodyText(body);
    transcript(to, 'buttons', `${cleanBody}\n[${safeButtons.map(b => b.reply.title).join(' | ')}]`);
    const card = {
        type: 'button',
        ...(imageUrl ? { header: { type: 'image', image: { link: imageUrl } } } : {}),
        body: { text: cleanBody },
        action: { buttons: safeButtons },
    };
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
        console.warn('[whatsapp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
        return;
    }
    if (process.env.WHATSAPP_DRY_RUN === '1') {
        console.log(`[whatsapp][dry-run][image-card] to=${to} img=${imageUrl ? 'yes' : 'no'} (${safeButtons.map(b => b.reply.id).join(',')})\n${cleanBody}`);
        return;
    }
    const ok = await postToWhatsApp(phoneNumberId, accessToken, {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: card,
    });
    if (!ok) {
        if (imageUrl) {
            await sendImageWithFallback(to, imageUrl, cleanBody);
            await sendInteractiveButtons(to, 'Options', buttons);
        }
        else {
            await sendInteractiveButtons(to, cleanBody, buttons);
        }
    }
}
async function sendWhatsAppTemplate(to, templateName, params = [], language = 'en') {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
        console.warn('[whatsapp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
        return false;
    }
    transcript(to, 'template', [templateName, ...params].join(' | '));
    return postToWhatsApp(phoneNumberId, accessToken, {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
            name: templateName,
            language: { code: language },
            components: params.length > 0
                ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: p })) }]
                : undefined,
        },
    });
}
/** Document message (CSV exports etc.): upload the file to Meta's media API,
 * then reference it by media id. Dry-run logs instead of uploading. */
async function sendWhatsAppDocument(to, filename, mime, content) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
        console.warn('[whatsapp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
        return false;
    }
    transcript(to, 'document', `${filename} (${mime})`);
    if (process.env.WHATSAPP_DRY_RUN === '1') {
        console.log(`[whatsapp][dry-run][document] to=${to} ${filename} (${mime}, ${content.length} bytes)`);
        return true;
    }
    try {
        const form = new FormData();
        const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
        form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), filename);
        form.append('messaging_product', 'whatsapp');
        const up = await fetch(`${WHATSAPP_API}/${phoneNumberId}/media`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: form,
        });
        if (!up.ok) {
            console.error('[whatsapp] Media upload failed:', await up.text());
            return false;
        }
        const { id } = (await up.json());
        if (!id) {
            console.error('[whatsapp] Media upload returned no id');
            return false;
        }
        return await postToWhatsApp(phoneNumberId, accessToken, {
            messaging_product: 'whatsapp',
            to,
            type: 'document',
            document: { id, filename },
        });
    }
    catch (err) {
        console.error('[whatsapp] Document send error:', err);
        return false;
    }
}
/**
 * Send an image message via WhatsApp Cloud API.
 * Uses the image URL directly (no upload needed) — accepts public URLs.
 * Caption supports up to 1024 characters.
 */
async function sendWhatsAppImage(to, imageUrl, caption, replyTo) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
        console.warn('[whatsapp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
        return false;
    }
    transcript(to, 'image', caption || imageUrl);
    if (process.env.WHATSAPP_DRY_RUN === '1') {
        console.log(`[whatsapp][dry-run][image] to=${to} ${imageUrl}\n${caption}`);
        return true;
    }
    return postToWhatsApp(phoneNumberId, accessToken, {
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: { link: imageUrl, caption: clip(caption, 1024) },
        ...(replyTo ? { context: { message_id: replyTo } } : {}),
    });
}
/**
 * Sends an image message, falling back to a plain text message when the
 * image send fails (so the customer always receives content).
 * Returns true when the image was actually sent.
 */
async function sendImageWithFallback(to, imageUrl, caption, replyTo) {
    let ok = false;
    if (imageUrl)
        ok = await sendWhatsAppImage(to, imageUrl, caption, replyTo);
    if (ok)
        return true;
    await sendWhatsAppMessage(to, caption);
    return false;
}
