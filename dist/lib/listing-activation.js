"use strict";
// Shared listing-subscription activation used by both confirmation paths:
//   • /api/paynow/result        (Paynow's server-to-server result update)
//   • /api/admin/subscriptions  (manual admin override)
// The moment a listing payment is confirmed, the subscription becomes active
// and the business flips to payment_status 'active' + verified, so it shows
// in search instantly.
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateListingSubscription = activateListingSubscription;
const whatsapp_js_1 = require("./whatsapp.js");
const site_url_js_1 = require("./site-url.js");
const bot_settings_js_1 = require("./bot-settings.js");
const bot_templates_js_1 = require("./bot-templates.js");
async function activateListingSubscription(supabase, subscriptionId, opts = {}) {
    const { data: sub } = await supabase
        .from('listing_subscriptions')
        .select('id, business_id, plan, pro_assistance, amount, payer_phone')
        .eq('id', subscriptionId)
        .maybeSingle();
    if (!sub)
        return { ok: false, error: 'Listing subscription not found' };
    const now = new Date();
    const { data: existingActive } = await supabase
        .from('listing_subscriptions')
        .select('id, expires_at')
        .eq('business_id', sub.business_id)
        .eq('status', 'active')
        .maybeSingle();
    // Activation extends an existing active period; otherwise starts fresh.
    const base = existingActive?.expires_at && new Date(existingActive.expires_at) > now
        ? new Date(existingActive.expires_at)
        : now;
    const planDays = sub.plan === '6m' ? 180 : sub.plan === '12m' ? 360 : 30;
    const expiresAt = new Date(base.getTime() + planDays * 86400000);
    const { error: subError } = await supabase
        .from('listing_subscriptions')
        .update({
        status: 'active',
        started_at: (existingActive?.expires_at ? undefined : now.toISOString()),
        expires_at: expiresAt.toISOString(),
        auto_confirmed_at: opts.autoConfirmed ? now.toISOString() : null,
    })
        .eq('id', subscriptionId);
    if (subError)
        return { ok: false, error: subError.message };
    const { error: bizError } = await supabase
        .from('businesses')
        .update({
        payment_status: 'active',
        verified: true,
        listing_activated_at: now.toISOString(),
    })
        .eq('id', sub.business_id);
    if (bizError)
        return { ok: false, error: bizError.message };
    // Owner onboarding notification — fires for auto-confirmed payments AND
    // admin manual confirmations alike: the moment money lands or the admin
    // activates, the owner gets their confirmation + every link.
    {
        const { data: business } = await supabase
            .from('businesses')
            .select('name, phone, username, slug')
            .eq('id', sub.business_id)
            .maybeSingle();
        if (business?.phone) {
            const siteUrl = site_url_js_1.SITE_URL;
            // Throw the owner their links immediately: listing, auto-website,
            // portal — the paying moment is the best onboarding window we get.
            const bizSlug = business.slug || business.username || '';
            const links = [
                `🏢 Profile: ${siteUrl}/business/${bizSlug}`,
                `🌐 Website: ${siteUrl}/site/${bizSlug}`,
                `🔑 Portal: ${siteUrl}/portal (log in with @${business.username || 'N/A'})`,
            ].filter(l => !l.includes('/N/A')); // no usernames on file → skip that line
            (0, whatsapp_js_1.sendWhatsAppMessage)(business.phone, [
                '🎉 *Payment received - you are live!*',
                '',
                `${business.name} (@${business.username || 'N/A'}) is now visible on WA Directory.`,
                `Active until ${expiresAt.toISOString().slice(0, 10)}.`,
                '',
                ...links,
                '',
                `Renew anytime: ${siteUrl}/pay`,
                '📸 After go-live: send a product photo, then reply *name price* (e.g. *bread $2*) - it lands on your website shop shelf.',
            ].join('\n')).catch(() => { });
            // Channel pitch: now that the supplier is live, tell them where buyer
            // leads surface (free-form while the session window is open).
            const chOverride = await (0, bot_settings_js_1.getBotSetting)('channel_link');
            const chLink = (chOverride || process.env.CHANNEL_LINK || '').trim();
            if (chLink) {
                (0, whatsapp_js_1.sendWhatsAppMessage)(business.phone, (0, bot_templates_js_1.renderChannelPitch)(chLink)).catch(() => { });
            }
        }
        // When someone pays for a business other than their own, the payer should
        // also hear the confirmation (the owner notify above targets the listing
        // phone). payer_phone is stored in 07… format; WhatsApp needs 263….
        const payerPhone = sub.payer_phone;
        const payerWa = payerPhone
            ? payerPhone.startsWith('263')
                ? payerPhone
                : payerPhone.startsWith('0')
                    ? `263${payerPhone.slice(1)}`
                    : null
            : null;
        if (payerWa && business?.phone !== payerWa) {
            (0, whatsapp_js_1.sendWhatsAppMessage)(payerWa, [
                '🎉 *Payment received!*',
                '',
                `${business?.name || 'The listing'} is paid and active until ${expiresAt.toISOString().slice(0, 10)}.`,
                '',
                'Thank you for supporting the directory!',
            ].join('\n')).catch(() => { });
        }
    }
    return { ok: true, businessId: sub.business_id };
}
