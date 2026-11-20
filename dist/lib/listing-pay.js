"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentAmountFor = paymentAmountFor;
exports.createListingPayment = createListingPayment;
// Core listing-subscription payment engine, shared by webapp and chatbot.
const supabase_server_js_1 = require("./supabase-server.js");
const site_url_js_1 = require("./site-url.js");
const phone_js_1 = require("./phone.js");
const index_js_1 = require("../types/index.js");
function paymentAmountFor(plan, hasProAssistance) {
    return index_js_1.PLAN_CONFIG[plan].price + (hasProAssistance ? index_js_1.PRO_ASSISTANCE_PRICE : 0);
}
async function createListingPayment(input, adapters) {
    const payerClean = (0, phone_js_1.digitsOnly)(input.payerPhone);
    if (payerClean.length < 9) {
        return { ok: false, status: 400, error: 'Invalid payer phone number' };
    }
    const supabase = (0, supabase_server_js_1.getSupabase)();
    const [{ data: business }, { data: specialCats }] = await Promise.all([
        supabase
            .from('businesses')
            .select('id, name, username, payment_status, category')
            .eq('business_id', input.businessId)
            .maybeSingle(),
        supabase
            .from('categories')
            .select('name')
            .eq('special', true),
    ]);
    if (!business) {
        return { ok: false, status: 404, error: 'Business not found' };
    }
    const bizId = business.id;
    if (business.payment_status === 'active') {
        return { ok: false, status: 400, error: 'This listing is already active' };
    }
    const isFree = business.category?.some((c) => (specialCats || []).some(sc => sc.name === c));
    if (isFree) {
        return { ok: false, status: 400, error: 'Yellow Pages listings are free' };
    }
    const { data: existing } = await supabase
        .from('listing_subscriptions')
        .select('id')
        .eq('business_id', bizId)
        .eq('status', 'pending')
        .maybeSingle();
    const amount = input.amountOverride ?? paymentAmountFor(input.plan, input.hasProAssistance);
    const planLabel = input.amountOverride != null ? 'Personal contact' : index_js_1.PLAN_CONFIG[input.plan].label;
    let subscriptionId;
    if (existing) {
        subscriptionId = existing.id;
        await supabase
            .from('listing_subscriptions')
            .update({ payer_phone: payerClean, amount, plan: input.plan, pro_assistance: !!input.hasProAssistance })
            .eq('id', existing.id);
    }
    else {
        const inserted = await supabase
            .from('listing_subscriptions')
            .insert({
            business_id: bizId,
            status: 'pending',
            amount,
            payer_phone: payerClean,
            plan: input.plan,
            pro_assistance: !!input.hasProAssistance,
        })
            .select('id')
            .single();
        if (inserted.error || !inserted.data) {
            return { ok: false, status: 500, error: inserted.error?.message || 'Could not create the payment record' };
        }
        subscriptionId = inserted.data.id;
    }
    await supabase
        .from('businesses')
        .update({ payment_status: 'pending' })
        .eq('id', bizId);
    let autoPayment = { initiated: false };
    if (adapters?.initiateEcoCashPayment && process.env.PAYNOW_INTEGRATION_ID && process.env.PAYNOW_INTEGRATION_KEY) {
        const init = await adapters.initiateEcoCashPayment({
            reference: `LISTING-${subscriptionId}`,
            amount,
            phone: payerClean,
            additionalInfo: `WA Directory listing: ${business.name} (${planLabel})`,
            resultUrl: `${site_url_js_1.SITE_URL}/api/paynow/result`,
            returnUrl: `${site_url_js_1.SITE_URL}/`,
        });
        if (init.ok && init.pollUrl) {
            await supabase
                .from('listing_subscriptions')
                .update({ paynow_poll_url: init.pollUrl, paynow_reference: init.paynowReference || null })
                .eq('id', subscriptionId);
            autoPayment = { initiated: true, instructions: init.instructions };
            await adapters.logPaymentEvent?.({
                eventType: 'payment_initiated',
                businessId: bizId,
                detail: { via: 'listing_pay', plan: input.plan, amount, paynowRef: init.paynowReference },
            });
        }
        else {
            await adapters.logPaymentEvent?.({
                eventType: 'payment_init_failed',
                outcome: 'error',
                businessId: bizId,
                detail: { via: 'listing_pay', error: init.error || 'unknown' },
            });
        }
    }
    if (process.env.ADMIN_WHATSAPP && adapters?.sendWhatsAppMessage) {
        await adapters.sendWhatsAppMessage(process.env.ADMIN_WHATSAPP, [
            autoPayment.initiated ? '💰 *AUTOMATIC PAYMENT IN PROGRESS*' : '💰 *PAYMENT REQUEST*',
            '',
            `Business: ${business.name}`,
            `Username: @${business.username || 'N/A'}`,
            `Plan: ${planLabel}`,
            `Amount: USD ${amount.toFixed(2)}`,
            input.hasProAssistance ? 'Add-on: Pro WhatsApp catalog setup' : '',
            `Payer EcoCash: +${payerClean}`,
            '',
            autoPayment.initiated
                ? 'EcoCash prompt sent to the payer. It will auto-confirm without admin action if they pay.'
                : `Check EcoCash for transaction from +${payerClean}`,
            autoPayment.initiated ? '' : `Review: ${site_url_js_1.SITE_URL}/admin`,
        ].filter(Boolean).join('\n'));
    }
    return {
        ok: true,
        autoEcoCash: autoPayment.initiated,
        instructions: autoPayment.instructions || null,
        message: autoPayment.initiated
            ? 'An EcoCash prompt was sent to your phone. Enter your PIN and your listing goes live automatically.'
            : 'Payment request submitted. Admin will verify and activate shortly.',
    };
}
