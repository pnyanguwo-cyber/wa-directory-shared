"use strict";
/**
 * WhatsApp business registration — plan choice → image-first → review.
 *
 * Entry order (deliberate):
 *   1. Choose how to activate: 90-day free trial or USD 2/month paid.
 *   2. Offer to upload a business card / flyer / banner / advert (image-first).
 *      The user may explicitly skip and enter details manually.
 *   3. Only after (2) do we ask the registration questions.
 *
 * The old registration handler can never start before the image-first step
 * has been completed or skipped: every state transition below goes through
 * REGISTRATION_STARTED → REGISTRATION_AWAITING_IMAGE → collecting/review.
 *
 * The native WhatsApp Flow is intentionally NOT launched from this entry
 * point. A published Flow ID can be an older form (the "Question 1 of 11"
 * experience), which would bypass the upload step entirely. The Flow data
 * exchange endpoint remains available, but chat registration is the
 * deterministic path.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REGISTRATION_BUTTONS = void 0;
exports.chooseRegistrationPlan = chooseRegistrationPlan;
exports.startRegistrationFlow = startRegistrationFlow;
exports.handleRegistrationMessage = handleRegistrationMessage;
exports.handleRegistrationImage = handleRegistrationImage;
exports.registrationPlanForTrial = registrationPlanForTrial;
const whatsapp_js_1 = require("./whatsapp.js");
const bot_state_js_1 = require("./bot-state.js");
const ai_registration_js_1 = require("./ai-registration.js");
const categories_js_1 = require("../data/categories.js");
const listing_create_js_1 = require("./listing-create.js");
const admin_notice_js_1 = require("./admin-notice.js");
const approved_data_js_1 = require("./approved-data.js");
const category_match_js_1 = require("./category-match.js");
const phone_js_1 = require("./phone.js");
const site_url_js_1 = require("./site-url.js");
const trial_helpers_js_1 = require("./trial-helpers.js");
const index_js_1 = require("../types/index.js");
const supabase_server_js_1 = require("./supabase-server.js");
const onboarding_log_js_1 = require("./onboarding-log.js");
const CATEGORY_NAMES = categories_js_1.categories.map(c => c.name);
/** The five details createListing cannot do without. */
const REQUIRED_FIELDS = ['business_name', 'category', 'phone', 'city', 'description'];
const FIELD_LABELS = {
    business_name: 'Business name',
    category: 'Category',
    phone: 'WhatsApp / phone number',
    city: 'City or town',
    description: 'What your business offers',
};
exports.REGISTRATION_BUTTONS = {
    upload: 'reg_upload',
    skip: 'reg_skip',
    proceed: 'reg_proceed',
    edit: 'reg_edit',
    planTrial: 'reg_plan_trial',
    planPaid: 'reg_plan_paid',
    publish: 'reg_publish',
    cancel: 'reg_cancel',
    talkAdmin: 'reg_talk_admin',
    askAdminPermission: 'reg_ask_admin_permission',
    changePhone: 'reg_change_phone',
};
function imageFirstMessage(planLabel) {
    return (`🏪 *Let's get your business listed!*\n\n` +
        `You chose: *${planLabel}*\n\n` +
        `Have a business card, flyer, banner or advert? Send us a picture and our AI ` +
        `will extract the business information it can identify, saving you time.\n\n` +
        `You can also skip this step and enter your details manually.`);
}
async function sendPlanChoice(phone) {
    await (0, bot_state_js_1.setConversationState)(phone, 'REGISTRATION_STARTED', { step: 'choose_plan' });
    (0, onboarding_log_js_1.logOnboarding)('registration_plan_menu', { phone: (0, onboarding_log_js_1.maskPhone)(phone) });
    const paid = index_js_1.PLAN_CONFIG['1m'];
    await (0, whatsapp_js_1.sendInteractiveButtons)(phone, `🏪 *Business listing — choose how to activate*\n\n` +
        `🆓 *${index_js_1.TRIAL_PLAN_LABEL}* — no payment required. Starts only after an administrator approves your listing. One trial per business.\n\n` +
        `💳 *${paid.label}* — USD ${(0, index_js_1.formatUsd)(paid.price)} per month via EcoCash.\n\n` +
        `Which option would you like?`, [
        { id: exports.REGISTRATION_BUTTONS.planTrial, title: '90-Day Free Trial' },
        { id: exports.REGISTRATION_BUTTONS.planPaid, title: `USD ${(0, index_js_1.formatUsd)(paid.price)}/month` },
    ]);
}
async function sendImageFirst(phone, plan) {
    const planLabel = plan === 'trial' ? index_js_1.TRIAL_PLAN_LABEL : index_js_1.PLAN_CONFIG[plan].label;
    await (0, bot_state_js_1.setConversationState)(phone, 'REGISTRATION_AWAITING_IMAGE', {
        step: 'choose_material',
        approvedPlan: plan,
        trialRequested: plan === 'trial',
    });
    (0, onboarding_log_js_1.logOnboarding)('registration_image_first', {
        phone: (0, onboarding_log_js_1.maskPhone)(phone),
        plan,
    });
    await (0, whatsapp_js_1.sendInteractiveButtons)(phone, imageFirstMessage(planLabel), [
        { id: exports.REGISTRATION_BUTTONS.upload, title: '📷 Send a picture' },
        { id: exports.REGISTRATION_BUTTONS.skip, title: 'Skip and enter manually' },
    ]);
}
/** Pick the trial or paid plan, then immediately offer the upload step. */
async function chooseRegistrationPlan(phone, choice) {
    const lower = (choice || '').toLowerCase().trim();
    let plan = null;
    if (lower === exports.REGISTRATION_BUTTONS.planTrial ||
        lower === 'trial' ||
        lower === 'free' ||
        lower === '1' ||
        lower.includes('trial')) {
        plan = 'trial';
    }
    else if (lower === exports.REGISTRATION_BUTTONS.planPaid ||
        lower === 'paid' ||
        lower === '2' ||
        lower === '1m' ||
        lower.includes('2')) {
        plan = '1m';
    }
    if (!plan)
        return false;
    (0, onboarding_log_js_1.logOnboarding)('registration_plan_selected', { phone: (0, onboarding_log_js_1.maskPhone)(phone), plan });
    await sendImageFirst(phone, plan);
    return true;
}
/**
 * Entry point. Resumes an in-progress registration instead of creating a
 * second session; otherwise starts with the plan choice.
 */
async function startRegistrationFlow(phone, opts = {}) {
    if (!opts.force) {
        const existing = await (0, bot_state_js_1.getConversationState)(phone);
        const state = existing?.state || '';
        const context = existing?.context || {};
        if (state.startsWith('REGISTRATION_') && state !== 'REGISTRATION_PROCESSING_IMAGE') {
            (0, onboarding_log_js_1.logOnboarding)('registration_resumed', { phone: (0, onboarding_log_js_1.maskPhone)(phone), state, step: context.step });
            if (state === 'REGISTRATION_AWAITING_IMAGE') {
                if (context.approvedPlan) {
                    await sendImageFirst(phone, context.approvedPlan);
                }
                else {
                    await sendPlanChoice(phone);
                }
            }
            else if (state === 'REGISTRATION_FINAL_REVIEW' && context.listing) {
                await showFinalReview(phone, context);
            }
            else if (state === 'REGISTRATION_COLLECTING_FIELDS') {
                await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `📝 Continuing your registration.\n\n${getPromptForField((context.missing || [])[context.currentMissingIndex || 0] || 'business_name')}\n\n(Type *cancel* at any time to abort)`);
            }
            else if (state === 'REGISTRATION_COLLECTING_OPTIONAL') {
                await askNextOptional(phone, context.optionalQueue || [], context.optionalIndex || 0);
            }
            else {
                await sendPlanChoice(phone);
            }
            return;
        }
    }
    await sendPlanChoice(phone);
}
function startManualCollection(phone, context, opts = {}) {
    const fields = opts.collected || context.fields || {};
    const missing = REQUIRED_FIELDS.filter(key => !fields?.[key]?.value);
    const index = 0;
    return (0, bot_state_js_1.setConversationState)(phone, 'REGISTRATION_COLLECTING_FIELDS', {
        ...context,
        step: 'collecting_fields',
        manual: true,
        fields,
        missing,
        currentMissingIndex: index,
    });
}
const OPTIONAL_FIELDS = [
    {
        key: 'website',
        label: 'Website',
        prompt: `Share your website link (e.g. https://example.co.zw), or tap Skip — if you don't have one, we'll create a free site page for you.`,
    },
    {
        key: 'address',
        label: 'Physical address',
        prompt: `What's your physical address (so customers can find you)? Tap Skip if you don't have a storefront.`,
    },
    {
        key: 'calls',
        label: 'Calls number',
        prompt: `Is there a number customers can call? Reply with it, or tap Skip if WhatsApp is the only way to reach you.`,
    },
    {
        key: 'password',
        label: 'Portal password',
        prompt: `Create a password for your business portal (at least 8 characters, with letters and numbers) so you can log in and edit your listing anytime. Skip is fine — you can set it later online at the link we send (loads a web page, so it uses mobile data).`,
    },
];
function validatePassword(value) {
    if (value.length < 8)
        return { ok: false, reason: 'That password is too short — it needs at least 8 characters.' };
    if (!/[A-Za-z]/.test(value))
        return { ok: false, reason: 'Your password needs at least one letter.' };
    if (!/[0-9]/.test(value))
        return { ok: false, reason: 'Your password needs at least one number.' };
    return { ok: true };
}
function looksLikeWebsite(value) {
    const v = value.trim();
    if (/^https?:\/\//i.test(v))
        return true;
    return /^[^\s]+\.[^\s]+$/.test(v);
}
/**
 * Map what the owner typed before the colon onto a listing field. Owners type
 * the label in their own words, so the match is by keyword rather than an
 * exact string: "Calls", "call number" and "telephone" all mean the same
 * field. Returns null for anything that is not a correction, which lets the
 * caller treat the message as an answer to a pending question instead.
 */
function parseListingEdit(text) {
    const m = text.match(/^(?:edit\s+)?([A-Za-z][A-Za-z ]{2,20}?)\s*:\s*([\s\S]+)$/i);
    if (!m)
        return null;
    const label = m[1].trim().toLowerCase();
    const value = m[2].trim();
    if (!value || value.length > 400)
        return null;
    // "Call" must be checked before "number" so "Calls number" is not a phone.
    if (label.includes('call') || label.includes('telephone'))
        return { fieldKey: 'calls', label: 'Calls number', value };
    if (label.includes('name'))
        return { fieldKey: 'business_name', label: 'Business name', value };
    if (label.includes('categor'))
        return { fieldKey: 'category', label: 'Category', value };
    if (label.includes('city') || label.includes('town'))
        return { fieldKey: 'city', label: 'City', value };
    if (label.includes('phone') || label.includes('whatsapp') || label.includes('number'))
        return { fieldKey: 'phone', label: 'WhatsApp number', value };
    if (label.includes('description') || label.includes('offer') || label.includes('bio'))
        return { fieldKey: 'description', label: 'Description', value };
    if (label.includes('website') || label.includes('site'))
        return { fieldKey: 'website', label: 'Website', value };
    if (label.includes('address'))
        return { fieldKey: 'address', label: 'Physical address', value };
    if (label.includes('area') || label.includes('suburb'))
        return { fieldKey: 'area', label: 'Area', value };
    if (label.includes('price'))
        return { fieldKey: 'price_range', label: 'Price range', value };
    return null;
}
/** The draft listing is always derived from the field set, never the other way
 * round — otherwise an edit saved on the listing is silently reverted the next
 * time the review screen rebuilds it from the fields. */
function buildListingFromFields(fields) {
    const v = (key) => (fields?.[key]?.value || '').toString().trim();
    return {
        name: v('business_name'),
        categories: [v('category') || 'Other'],
        city: v('city'),
        phone: v('phone'),
        area: v('area'),
        description: v('description'),
        website: v('website'),
        address: v('address'),
        calls: v('calls'),
        priceRange: v('price_range'),
        requestedCategory: v('requested_category'),
        notify: false,
    };
}
/** Apply a typed correction to the field set and the draft listing together. */
async function saveListingEdit(phone, context, edit) {
    const fields = { ...(context.fields || {}) };
    setFieldValue(fields, edit.fieldKey, edit.value);
    if (edit.fieldKey === 'category')
        setFieldValue(fields, 'requested_category', edit.value);
    const listing = { ...(context.listing || {}), ...buildListingFromFields(fields) };
    await (0, bot_state_js_1.updateConversationContext)(phone, { fields, listing });
    return { fields, listing };
}
function editConfirmation(edit, nextStep) {
    return `✅ Updated *${edit.label}* to: ${edit.value}\n\n${nextStep}`;
}
async function startOptionalCollection(phone, context) {
    const fields = (context.fields || {});
    const queue = OPTIONAL_FIELDS.filter(item => item.key === 'password' || !fields[item.key]?.value);
    const optionalSaved = await (0, bot_state_js_1.setConversationState)(phone, 'REGISTRATION_COLLECTING_OPTIONAL', {
        ...context,
        step: 'optional_fields',
        optionalQueue: queue.map(item => item.key),
        optionalIndex: 0,
    });
    if (!optionalSaved) {
        await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, '⚠️ Something went wrong saving your progress. Please send your last answer again.');
        return;
    }
    await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `🎉 All required details captured. Just a few optional extras — skip any you don't need.`);
    await askNextOptional(phone, queue.map(item => item.key), 0);
}
async function askNextOptional(phone, queue, index) {
    const key = queue[index];
    if (!key) {
        const state = await (0, bot_state_js_1.getConversationState)(phone);
        await showFinalReview(phone, state?.context || {});
        return;
    }
    const item = OPTIONAL_FIELDS.find(i => i.key === key);
    if (!item) {
        await askNextOptional(phone, queue, index + 1);
        return;
    }
    await (0, whatsapp_js_1.sendInteractiveButtons)(phone, `*Optional details (${index + 1}/${queue.length})*\n\n${item.prompt}`, [{ id: exports.REGISTRATION_BUTTONS.skip, title: 'Skip' }]);
}
async function advanceOptional(phone, queue, index, context) {
    const nextIndex = index + 1;
    await (0, bot_state_js_1.updateConversationContext)(phone, { optionalIndex: nextIndex });
    if (nextIndex < queue.length) {
        await askNextOptional(phone, queue, nextIndex);
        return;
    }
    const state = await (0, bot_state_js_1.getConversationState)(phone);
    await showFinalReview(phone, state?.context || context);
}
async function saveOptionalValue(phone, queue, index, context, value) {
    const key = queue[index];
    const fields = { ...(context.fields || {}) };
    setFieldValue(fields, key, value);
    await (0, bot_state_js_1.updateConversationContext)(phone, { fields });
    await advanceOptional(phone, queue, index, { ...context, fields });
}
async function handleOptionalCollection(phone, text, context) {
    const queue = context.optionalQueue || [];
    const index = context.optionalIndex || 0;
    const key = queue[index];
    if (!key) {
        await showFinalReview(phone, context);
        return;
    }
    const item = OPTIONAL_FIELDS.find(i => i.key === key);
    if (!item) {
        await advanceOptional(phone, queue, index, context);
        return;
    }
    const trimmed = text.trim();
    // A correction typed while an optional question is pending belongs to the
    // listing, not to that question. Without this an owner who taps "Edit
    // details" mid-way has their fix swallowed as, say, the website answer.
    const typedEdit = parseListingEdit(text);
    if (typedEdit) {
        await saveListingEdit(phone, context, typedEdit);
        if (typedEdit.fieldKey === key) {
            await advanceOptional(phone, queue, index, context);
            return;
        }
        await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, editConfirmation(typedEdit, item.prompt));
        return;
    }
    if (trimmed.toLowerCase() === 'edit' || trimmed === exports.REGISTRATION_BUTTONS.edit) {
        await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `✏️ To change a detail, type it like this:\n\`City: Bulawayo\`\n\n${item.prompt}`);
        return;
    }
    if (trimmed.toLowerCase() === 'skip' || trimmed === exports.REGISTRATION_BUTTONS.skip) {
        (0, onboarding_log_js_1.logOnboarding)('registration_optional_skipped', { phone: (0, onboarding_log_js_1.maskPhone)(phone), field: key });
        await advanceOptional(phone, queue, index, context);
        return;
    }
    if (key === 'website' && !looksLikeWebsite(trimmed)) {
        await (0, whatsapp_js_1.sendInteractiveButtons)(phone, `⚠️ That doesn't look like a website link (we expect something like https://example.co.zw).\n\n${item.prompt}`, [{ id: exports.REGISTRATION_BUTTONS.skip, title: 'Skip' }]);
        return;
    }
    if (key === 'password') {
        const validation = validatePassword(trimmed);
        if (!validation.ok) {
            await (0, whatsapp_js_1.sendInteractiveButtons)(phone, `❌ ${validation.reason}\n\n${item.prompt}`, [{ id: exports.REGISTRATION_BUTTONS.skip, title: 'Skip' }]);
            return;
        }
        await (0, bot_state_js_1.updateConversationContext)(phone, { password: trimmed });
        await advanceOptional(phone, queue, index, context);
        return;
    }
    await saveOptionalValue(phone, queue, index, context, trimmed);
}
// Tell the admin that a business needs help with an international phone
// number so a human can add it to the listing by hand (the full numbers are
// included on purpose — the admin must be able to reach out directly).
async function notifyAdminsOfHandoff(phone, pendingPhone) {
    const adminPhone = process.env.ADMIN_WHATSAPP;
    if (!adminPhone)
        return;
    try {
        await (0, whatsapp_js_1.sendWhatsAppMessage)(adminPhone, `📞 *Handoff requested*\nBusiness ${(0, onboarding_log_js_1.maskPhone)(phone)} asked for help with the phone number ${pendingPhone} they entered during registration. Reply on their WhatsApp chat or reach out to ${(0, onboarding_log_js_1.maskPhone)(phone)} to arrange it.`);
    }
    catch (err) {
        (0, onboarding_log_js_1.logOnboarding)('registration_handoff_notify_failed', {
            phone: (0, onboarding_log_js_1.maskPhone)(phone),
            error: err instanceof Error ? err.message : String(err),
        });
    }
}
async function handleRegistrationMessage(phone, text, context) {
    const lower = text.toLowerCase().trim();
    if (lower === 'cancel' || lower === 'quit' || lower === 'stop' || lower === exports.REGISTRATION_BUTTONS.cancel) {
        await (0, bot_state_js_1.clearConversationState)(phone);
        (0, onboarding_log_js_1.logOnboarding)('registration_cancelled', { phone: (0, onboarding_log_js_1.maskPhone)(phone) });
        await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, '❌ Registration cancelled. Type *register* whenever you are ready to start again.');
        return;
    }
    // Non-ZW phone captured and pending a decision (ask admin / change
    // number / talk to team). Buttons above re-enter this branch.
    if (context.pendingPhone) {
        const pendingPhone = context.pendingPhone;
        if (text === exports.REGISTRATION_BUTTONS.talkAdmin || lower === 'help' || lower === 'help me') {
            (0, onboarding_log_js_1.logOnboarding)('registration_handoff_requested', { phone: (0, onboarding_log_js_1.maskPhone)(phone) });
            await notifyAdminsOfHandoff(phone, pendingPhone);
            await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `👋 *We'll help you get it right.*\n\nA member of our team can add your details by hand — just tap below and say hello:\n\n👉 https://wa.me/263773791864\n\nWe've been notified and will reach out to you too. Registration is paused — you can also use the buttons above to continue without help.`);
            return;
        }
        if (text === exports.REGISTRATION_BUTTONS.askAdminPermission) {
            (0, onboarding_log_js_1.logOnboarding)('registration_nonzw_admin_ok', { phone: (0, onboarding_log_js_1.maskPhone)(phone) });
            await notifyAdminsOfHandoff(phone, pendingPhone);
            await handleFieldCollection(phone, pendingPhone, { ...context, pendingPhone: undefined, adminPermissionRequested: true });
            return;
        }
        if (text === exports.REGISTRATION_BUTTONS.changePhone) {
            (0, onboarding_log_js_1.logOnboarding)('registration_nonzw_change_phone', { phone: (0, onboarding_log_js_1.maskPhone)(phone) });
            await (0, bot_state_js_1.setConversationState)(phone, 'REGISTRATION_COLLECTING_FIELDS', { ...context, pendingPhone: undefined });
            await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `🔁 No problem.\n\n${getPromptForField('phone')}`);
            return;
        }
        if ((0, phone_js_1.classifyPhone)(text) !== 'bad') {
            await handleFieldCollection(phone, text, { ...context, pendingPhone: undefined });
            return;
        }
        await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `⚠️ The number ${pendingPhone} is still pending. Tap a button above to continue, or type *cancel* to abort.`);
        return;
    }
    // A Flow that was opened previously and has not completed: if the user
    // sends a chat message instead of completing the Flow, fall back to the
    // image-first chatbot path rather than leaving them stuck.
    if (context.step === 'flow_active') {
        (0, onboarding_log_js_1.logOnboarding)('flow_fallback_chat', { phone: (0, onboarding_log_js_1.maskPhone)(phone) });
        await sendPlanChoice(phone);
        return;
    }
    if (context.step === 'choose_plan') {
        const chosen = await chooseRegistrationPlan(phone, text);
        if (!chosen) {
            await sendPlanChoice(phone);
        }
        return;
    }
    if (context.step === 'choose_material' || context.step === 'awaiting_photo') {
        if (lower === 'skip' || lower === 'manual' || lower === 'enter manually' || lower === exports.REGISTRATION_BUTTONS.skip) {
            (0, onboarding_log_js_1.logOnboarding)('registration_skip_upload', { phone: (0, onboarding_log_js_1.maskPhone)(phone) });
            await startManualCollection(phone, context);
            const first = REQUIRED_FIELDS[0];
            await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `📝 *Manual Registration (1/5)*\n\n${getPromptForField(first)}\n\n(Type *cancel* at any time to abort)`);
            return;
        }
        if (lower === 'send picture' || lower === 'picture' || lower === 'photo' || lower === 'upload' || lower === exports.REGISTRATION_BUTTONS.upload) {
            await (0, bot_state_js_1.updateConversationContext)(phone, { step: 'awaiting_photo' });
            await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `📷 Send the picture now as a photo in this chat.\n\nIt can be a business card, flyer, banner, advert, menu or poster. Type *skip* instead to enter details manually.`);
            return;
        }
        // Anything else before a choice: keep the upload option in front of them.
        await sendImageFirst(phone, context.approvedPlan || '1m');
        return;
    }
    if (context.state === 'REGISTRATION_COLLECTING_FIELDS' || context.step === 'collecting_fields' || context.step === 'collecting_missing') {
        await handleFieldCollection(phone, text, context);
        return;
    }
    if (context.step === 'optional_fields') {
        await handleOptionalCollection(phone, text, context);
        return;
    }
    if (context.step === 'review_extracted') {
        if (lower === 'proceed' || lower === 'yes' || lower === 'continue' || lower === 'ok' || lower === exports.REGISTRATION_BUTTONS.proceed) {
            await startOptionalCollection(phone, context);
            return;
        }
        if (lower === 'edit' || lower === exports.REGISTRATION_BUTTONS.edit) {
            await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `✏️ To change a detail, just type it:\n\`City: Bulawayo\`\n\n(The \`edit City: Bulawayo\` style works too.)\n\nThen type *proceed*.`);
            return;
        }
        // Accept both "edit City: Bulawayo" and the plain "City: Bulawayo".
        const typedEdit = parseListingEdit(text);
        if (typedEdit) {
            await saveListingEdit(phone, context, typedEdit);
            await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, editConfirmation(typedEdit, 'Type *proceed* when ready, or keep editing (e.g. `City: Bulawayo`).'));
            return;
        }
        await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `Type *proceed* to review your listing, or change a detail by typing it (e.g. \`City: Bulawayo\`).`);
        return;
    }
    // Final review stage
    if (context.step === 'final_review') {
        if (lower === 'publish' || lower === 'submit' || lower === 'yes' || lower === exports.REGISTRATION_BUTTONS.publish) {
            await submitRegistration(phone, context);
            return;
        }
        if (lower === 'edit' || lower === exports.REGISTRATION_BUTTONS.edit) {
            await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `✏️ To change a detail, just type it:\n\`City: Bulawayo\`\n\n(The \`edit City: Bulawayo\` style works too.)\n\nThen tap or type *publish*.`);
            return;
        }
        // Accept both "edit City: Bulawayo" and the plain "City: Bulawayo".
        const passwordEdit = text.match(/^(?:edit\s+)?password\s*:\s*([\s\S]+)$/i);
        if (passwordEdit) {
            const fieldValue = passwordEdit[1].trim();
            const listing = context.listing || {};
            const validation = validatePassword(fieldValue);
            if (!validation.ok) {
                await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `❌ ${validation.reason}\n\nTry again: \`Password: YourChoice123\``);
                return;
            }
            await (0, bot_state_js_1.updateConversationContext)(phone, { password: fieldValue });
            const fresh = await (0, bot_state_js_1.getConversationState)(phone);
            await showFinalReview(phone, { ...(fresh?.context || context), listing, password: fieldValue });
            return;
        }
        const typedEdit = parseListingEdit(text);
        if (typedEdit) {
            const saved = await saveListingEdit(phone, context, typedEdit);
            const fresh = await (0, bot_state_js_1.getConversationState)(phone);
            await showFinalReview(phone, { ...(fresh?.context || context), ...saved });
            return;
        }
        await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `Type *publish* to submit your listing, or change a detail by typing it (e.g. \`City: Bulawayo\`).`);
    }
}
function setFieldValue(fields, key, value) {
    fields[key] = { value, confidence: 1.0, status: 'suggested' };
}
async function handleRegistrationImage(phone, imageBytes, caption) {
    // Capture the plan before overwriting state: the processing state below
    // replaces the whole context, and losing the plan here silently downgraded
    // an image-first trial registration to "paid".
    const previous = await (0, bot_state_js_1.getConversationState)(phone);
    const approvedPlan = previous?.context?.approvedPlan;
    const trialRequested = previous?.context?.trialRequested === true || approvedPlan === 'trial';
    await (0, bot_state_js_1.setConversationState)(phone, 'REGISTRATION_PROCESSING_IMAGE', {
        step: 'processing',
        approvedPlan,
        trialRequested,
    });
    (0, onboarding_log_js_1.logOnboarding)('registration_image_received', { phone: (0, onboarding_log_js_1.maskPhone)(phone) });
    await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `🔍 Reading your business material with AI... Please give us a moment.`);
    try {
        const outcome = await (0, ai_registration_js_1.analyseBusinessMaterial)([imageBytes], CATEGORY_NAMES);
        if (!outcome.ok) {
            await (0, bot_state_js_1.setConversationState)(phone, 'REGISTRATION_AWAITING_IMAGE', {
                step: 'choose_material',
                approvedPlan,
                trialRequested,
            });
            (0, onboarding_log_js_1.logOnboarding)('registration_image_failed', { phone: (0, onboarding_log_js_1.maskPhone)(phone), reason: outcome.reason });
            await (0, whatsapp_js_1.sendInteractiveButtons)(phone, `⚠️ *We couldn't read the information in that image.*\n\n` +
                `You can try another picture or enter your details manually.`, [
                { id: exports.REGISTRATION_BUTTONS.upload, title: '📷 Try another picture' },
                { id: exports.REGISTRATION_BUTTONS.skip, title: 'Enter manually' },
            ]);
            return;
        }
        const draft = outcome.draft;
        const fields = draft.fields;
        // Check mandatory fields using the same list the collector uses.
        const missing = REQUIRED_FIELDS.filter(key => !fields[key]?.value);
        // Format found vs missing summary
        const foundLines = [];
        const missingLines = [];
        for (const key of REQUIRED_FIELDS) {
            if (fields[key]?.value)
                foundLines.push(`✓ ${FIELD_LABELS[key]}: ${fields[key].value}`);
            else
                missingLines.push(`○ ${FIELD_LABELS[key]}`);
        }
        if (fields.website?.value)
            foundLines.push(`✓ Website: ${fields.website.value}`);
        if (fields.address?.value)
            foundLines.push(`✓ Address: ${fields.address.value}`);
        if (fields.area?.value)
            foundLines.push(`✓ Area: ${fields.area.value}`);
        let msg = `🔍 *We've read your business information!*\n\nHere is what we found:\n\n` + foundLines.join('\n');
        if (missingLines.length > 0) {
            msg += `\n\nWe couldn't identify:\n\n` + missingLines.join('\n');
        }
        if (missing.length > 0) {
            await (0, bot_state_js_1.setConversationState)(phone, 'REGISTRATION_COLLECTING_FIELDS', {
                step: 'collecting_missing',
                approvedPlan,
                trialRequested,
                draft,
                fields,
                missing,
                currentMissingIndex: 0,
            });
            (0, onboarding_log_js_1.logOnboarding)('registration_image_extracted', { phone: (0, onboarding_log_js_1.maskPhone)(phone), missing: missing.length });
            msg += `\n\nLet's complete the missing details.\n\n` + getPromptForField(missing[0]);
            await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, msg);
            return;
        }
        await (0, bot_state_js_1.setConversationState)(phone, 'REGISTRATION_REVIEW_EXTRACTED', {
            step: 'review_extracted',
            approvedPlan,
            trialRequested,
            draft,
            fields,
            missing: [],
        });
        (0, onboarding_log_js_1.logOnboarding)('registration_image_extracted', { phone: (0, onboarding_log_js_1.maskPhone)(phone), missing: 0 });
        msg += `\n\nAll required information found. Please review it above and confirm.`;
        await (0, whatsapp_js_1.sendInteractiveButtons)(phone, msg, [
            { id: exports.REGISTRATION_BUTTONS.proceed, title: '✅ Looks good' },
            { id: exports.REGISTRATION_BUTTONS.edit, title: '✏️ Edit details' },
        ]);
    }
    catch (err) {
        console.error('[bot-registration] Image analysis error:', err);
        await (0, bot_state_js_1.setConversationState)(phone, 'REGISTRATION_AWAITING_IMAGE', {
            step: 'choose_material',
            approvedPlan,
            trialRequested,
        });
        await (0, whatsapp_js_1.sendInteractiveButtons)(phone, `⚠️ An error occurred while processing your image. Please try again or enter details manually.`, [
            { id: exports.REGISTRATION_BUTTONS.upload, title: '📷 Try another picture' },
            { id: exports.REGISTRATION_BUTTONS.skip, title: 'Enter manually' },
        ]);
    }
}
function getPromptForField(field) {
    switch (field) {
        case 'business_name':
            return `What is your business name?`;
        case 'category':
            return `Which category best describes your business? (e.g. Food & Restaurant, Hardware, Clothing & Fashion)`;
        case 'phone':
            return `Which phone number should customers use on WhatsApp?`;
        case 'city':
            return `📍 Which city or town is your business in?`;
        case 'description':
            return `In a few words, what products or services does your business offer?`;
        default:
            return `Please provide: ${field}`;
    }
}
async function handleFieldCollection(phone, text, context) {
    const fields = context.fields || {};
    const missing = context.missing || [];
    const index = context.currentMissingIndex || 0;
    const currentFieldKey = missing[index];
    // "Name: X" is a correction while questions are still being asked, unless
    // the label is the question on screen — then it is simply the answer.
    const typedEdit = parseListingEdit(text);
    if (typedEdit && typedEdit.fieldKey !== currentFieldKey) {
        await saveListingEdit(phone, context, typedEdit);
        await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, editConfirmation(typedEdit, getPromptForField(currentFieldKey || '')));
        return;
    }
    if (currentFieldKey) {
        if (currentFieldKey === 'phone' && (0, phone_js_1.classifyPhone)(text) === 'nonzw') {
            const guardedSaved = await (0, bot_state_js_1.setConversationState)(phone, 'REGISTRATION_COLLECTING_FIELDS', { ...context, pendingPhone: text });
            if (!guardedSaved) {
                await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, '⚠️ Something went wrong saving your answer. Please send your phone number again.');
                return;
            }
            (0, onboarding_log_js_1.logOnboarding)('registration_nonzw_phone_flagged', { phone: (0, onboarding_log_js_1.maskPhone)(phone) });
            await (0, whatsapp_js_1.sendInteractiveButtons)(phone, `⚠️ *The number ${text} doesn't look like a Zimbabwean number.*\n\nHow would you like to continue? Our team can also add it to your listing by hand.`, [
                { id: exports.REGISTRATION_BUTTONS.askAdminPermission, title: '✅ Ask admin for help' },
                { id: exports.REGISTRATION_BUTTONS.changePhone, title: '🔁 Use a different number' },
                { id: exports.REGISTRATION_BUTTONS.talkAdmin, title: '💬 Talk to our team' },
            ]);
            return;
        }
        // A category is applied only when the words are unambiguous (exact, a
        // one-letter typo, or the same words with filler removed). Otherwise the
        // owner's wording is kept and a request goes to the admin - the listing is
        // never filed under a guess without a human seeing it.
        let answer = text;
        let categoryNote = '';
        if (currentFieldKey === 'category') {
            const decision = (0, category_match_js_1.categoryDecision)(text, await (0, approved_data_js_1.getApprovedCategories)());
            answer = decision.category;
            if (decision.applied === 'unresolved') {
                setFieldValue(fields, 'requested_category', decision.requested);
                categoryNote = `📝 Noted: *${decision.requested}* is not a category yet - I've sent it to our team, who will confirm it.`;
            }
        }
        setFieldValue(fields, currentFieldKey, answer);
        if (categoryNote)
            await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, categoryNote);
    }
    const nextIndex = index + 1;
    if (nextIndex < missing.length) {
        const advancedSaved = await (0, bot_state_js_1.setConversationState)(phone, 'REGISTRATION_COLLECTING_FIELDS', {
            ...context,
            fields,
            missing,
            currentMissingIndex: nextIndex,
        });
        if (!advancedSaved) {
            await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, '⚠️ Something went wrong saving your answer. Please send it again.');
            return;
        }
        await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `✅ Saved.\n\n${getPromptForField(missing[nextIndex])}\n\n(${nextIndex + 1}/${missing.length})`);
        return;
    }
    // All required fields collected — collect the optional details next.
    await startOptionalCollection(phone, { ...context, fields, missing, currentMissingIndex: missing.length });
}
async function showFinalReview(phone, context) {
    const f = context.fields || {};
    const name = f.business_name?.value || 'Not set';
    const category = f.category?.value || 'Other';
    const city = f.city?.value || 'Harare';
    const phoneVal = f.phone?.value || phone;
    const area = f.area?.value || '';
    const description = f.description?.value || '';
    const website = f.website?.value || '';
    const address = f.address?.value || '';
    const calls = f.calls?.value || '';
    const requestedCategory = f.requested_category?.value || '';
    const phoneWarning = (0, phone_js_1.classifyPhone)(phoneVal) === 'nonzw'
        ? `⚠️ Phone: ${phoneVal} is not a Zimbabwean number — our team will help add it correctly.\n`
        : '';
    const listing = buildListingFromFields({ ...f, phone: { value: phoneVal }, city: { value: city } });
    const reviewSaved = await (0, bot_state_js_1.setConversationState)(phone, 'REGISTRATION_FINAL_REVIEW', {
        ...context,
        step: 'final_review',
        fields: f,
        listing,
    });
    if (!reviewSaved) {
        await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, '⚠️ Something went wrong saving your listing. Please send "done" again.');
        return;
    }
    await (0, whatsapp_js_1.sendInteractiveButtons)(phone, `🏪 *Your listing — Ready to submit*\n\n` +
        `${phoneWarning}` +
        `✓ Name: ${name}\n` +
        `✓ Category: ${category}\n` +
        `✓ City: ${city}\n` +
        `✓ Phone: ${phoneVal}\n` +
        `${calls ? `✓ Calls: ${calls}\n` : ''}` +
        `${requestedCategory ? `· Category you described: ${requestedCategory} (our team confirms this)\n` : ''}` +
        `${area ? `✓ Area: ${area}\n` : ''}` +
        `${description ? `✓ Description: ${description}\n` : ''}` +
        `${website ? `✓ Website: ${website}\n` : ''}` +
        `${address ? `✓ Address: ${address}\n` : ''}` +
        `${context.password ? '✓ Portal password: set\n' : ''}` +
        `\nActivation: ${context.approvedPlan === 'trial' ? index_js_1.TRIAL_PLAN_LABEL + ' (starts when an admin approves)' : `Paid — USD ${(0, index_js_1.formatUsd)(index_js_1.PLAN_CONFIG['1m'].price)}/month`}\n\n` +
        `Reply \`City: Bulawayo\` to change a detail (or \`edit City: Bulawayo\`).\n` +
        `Tap *🚀 Publish listing* when ready.`, [
        { id: exports.REGISTRATION_BUTTONS.publish, title: '🚀 Publish listing' },
        { id: exports.REGISTRATION_BUTTONS.cancel, title: '❌ Cancel' },
    ]);
}
async function submitRegistration(phone, context) {
    if (context.submitting) {
        (0, onboarding_log_js_1.logOnboarding)('registration_duplicate_submit_blocked', { phone: (0, onboarding_log_js_1.maskPhone)(phone) });
        await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `⏳ Your listing is already being submitted. Please wait a moment.`);
        return;
    }
    const listingData = context.listing || {};
    const name = (listingData.name || '').trim();
    const phoneValue = listingData.phone || phone;
    await (0, bot_state_js_1.setConversationState)(phone, 'REGISTRATION_PROCESSING_IMAGE', {
        ...context,
        step: 'submitting',
        submitting: true,
    });
    // One listing per business identity: a second pending/active listing with
    // the same name and phone is not created.
    if (name) {
        const supabase = (0, supabase_server_js_1.getSupabase)();
        const { data: duplicate } = await supabase
            .from('businesses')
            .select('id')
            .ilike('name', name)
            .eq('phone', phoneValue)
            .in('payment_status', ['pending', 'active'])
            .maybeSingle();
        if (duplicate) {
            (0, onboarding_log_js_1.logOnboarding)('registration_duplicate_listing_blocked', { phone: (0, onboarding_log_js_1.maskPhone)(phone) });
            await (0, bot_state_js_1.clearConversationState)(phone);
            await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `ℹ️ *A listing with these details already exists.*\n\n` +
                `Your existing listing is pending review or already live. ` +
                `Edit it from your portal, or contact support if you need another branch listed.`);
            return;
        }
    }
    const result = await (0, listing_create_js_1.createListing)({
        name: listingData.name,
        categories: listingData.categories || ['Other'],
        city: listingData.city || 'Harare',
        phone: listingData.phone || phone,
        areas: listingData.area ? [listingData.area] : [],
        description: listingData.description || '',
        website: listingData.website || '',
        address: listingData.address || '',
        voicePhone: listingData.calls || '',
        requestedCategory: listingData.requestedCategory || '',
        generateSite: !listingData.website,
    });
    if ('error' in result) {
        await (0, bot_state_js_1.setConversationState)(phone, 'REGISTRATION_FINAL_REVIEW', { ...context, step: 'final_review', submitting: false });
        await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `❌ Error creating listing: ${result.error}\n\nPlease type *publish* to try again or *cancel*.`);
        return;
    }
    // Push admin-review requests for any unapproved city / area (mirrors the
    // web form's feature requests). When an admin verifies the business, these
    // are auto-approved and the location lands in the cities/areas tables.
    try {
        const newRequests = await (0, listing_create_js_1.autoRequestUnapprovedFeatures)(result.id, {
            categories: result.categories,
            city: result.city || '',
            areas: listingData.area ? [listingData.area] : [],
            requestedCategory: listingData.requestedCategory || '',
        });
        const adminNotice = (0, listing_create_js_1.adminRequestNotice)(result.name, result.businessId, newRequests);
        if (adminNotice && process.env.ADMIN_WHATSAPP) {
            await (0, admin_notice_js_1.sendAdminNotice)(process.env.ADMIN_WHATSAPP, adminNotice, (0, admin_notice_js_1.reviewRequestButtons)(result.name)).catch(() => { });
        }
    }
    catch (err) {
        (0, onboarding_log_js_1.logOnboarding)('auto_location_request_failed', {
            phone: (0, onboarding_log_js_1.maskPhone)(phone),
            error: err instanceof Error ? err.message : String(err),
        });
    }
    // Ping the admin on WhatsApp for every new listing (the wizard publish path
    // sends the same card) — with the verify commands ready to copy.
    if (process.env.ADMIN_WHATSAPP) {
        const cats = Array.isArray(result.categories) ? result.categories.join(', ') : '';
        await (0, admin_notice_js_1.sendAdminNotice)(process.env.ADMIN_WHATSAPP, (0, admin_notice_js_1.submissionNoticeBody)({
            title: '🆕 NEW BUSINESS PENDING VERIFICATION',
            name: result.name,
            code: result.businessId,
            category: cats,
            location: result.city || '',
            phone: listingData.phone || phone,
            extra: [
                ...(listingData.calls ? [`Calls: ${listingData.calls}`] : []),
                ...(listingData.requestedCategory
                    ? [`Owner described category as: ${listingData.requestedCategory}`]
                    : []),
            ],
        }), (0, admin_notice_js_1.pendingVerificationButtons)(result.name)).catch(() => { });
    }
    const fullPhone = (0, phone_js_1.toFullPhone)('+263', listingData.phone || phone);
    let portalLine = `🔐 Your portal is where you edit your listing & website, get business card + QR code templates, and see your stats.\nSet your password online (opens a web page, uses data): ${site_url_js_1.SITE_URL}/account-setup?token=${result.editToken}`;
    if (context.password) {
        try {
            const response = await fetch(`${site_url_js_1.SITE_URL}/api/account/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    edit_token: result.editToken,
                    phone: fullPhone,
                    password: context.password,
                }),
            });
            if (response.ok) {
                portalLine = `✅ Portal account created — log in at ${site_url_js_1.SITE_URL}/login with your number and password.\nInside: edit your listing & website, business card + QR code templates, stats.`;
            }
            else {
                (0, onboarding_log_js_1.logOnboarding)('portal_account_create_failed', {
                    phone: (0, onboarding_log_js_1.maskPhone)(phone),
                    status: response.status,
                });
            }
        }
        catch (err) {
            (0, onboarding_log_js_1.logOnboarding)('portal_account_create_failed', {
                phone: (0, onboarding_log_js_1.maskPhone)(phone),
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    // Record a trial *request* only. The 90 days start later, when an admin
    // approves/publishes the listing — never now.
    let trialRequested = false;
    if (context.approvedPlan === 'trial') {
        const request = await (0, trial_helpers_js_1.requestTrial)(result.id);
        trialRequested = request.ok;
        if (!request.ok) {
            (0, onboarding_log_js_1.logOnboarding)('trial_request_failed', { phone: (0, onboarding_log_js_1.maskPhone)(phone), error: request.error });
        }
    }
    // The registration session ends here; the listing is now in review. Keeping
    // AWAITING_ADMIN_REVIEW (rather than deleting state) also prevents a second
    // registration session from being started by a stray message.
    await (0, bot_state_js_1.setConversationState)(phone, 'AWAITING_ADMIN_REVIEW', {
        businessId: result.id,
        businessName: result.name,
        businessSlug: result.slug,
        approvedPlan: context.approvedPlan || '1m',
        trialRequested,
        city: listingData.city || '',
    });
    (0, onboarding_log_js_1.logOnboarding)('registration_submitted', {
        phone: (0, onboarding_log_js_1.maskPhone)(phone),
        businessId: result.businessId,
        plan: context.approvedPlan || '1m',
        trialRequested,
    });
    const activationLine = trialRequested
        ? `\n\n🆓 *${index_js_1.TRIAL_PLAN_LABEL} requested.* It starts only after our team approves and publishes your listing, and runs for 90 days with no payment.`
        : `\n\n💳 Activation: USD ${(0, index_js_1.formatUsd)(index_js_1.PLAN_CONFIG['1m'].price)}/month after approval.`;
    await (0, whatsapp_js_1.sendWhatsAppMessage)(phone, `🎉 *Listing Submitted Successfully!*\n\n` +
        `Your business *${result.name}* has been submitted for review.\n` +
        `Business ID: ${result.businessId}\n` +
        `Username: @${result.username}\n\n` +
        `Our team will review your listing within 24 hours.` +
        activationLine +
        `\n\n${portalLine}\n` +
        `✏️ Edit anytime: ${site_url_js_1.SITE_URL}/edit?token=${result.editToken}`);
}
/** Exported for the webhook's Flow-completion path and tests. */
function registrationPlanForTrial(status) {
    return status === 'requested';
}
