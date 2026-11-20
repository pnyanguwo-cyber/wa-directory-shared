"use strict";
/**
 * Conversation state management for WhatsApp onboarding/payment flow.
 * Persists state in Supabase to prevent payment responses being interpreted
 * as searches/bids. Server-side only (service role).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRIAL_PLAN_LABEL = exports.formatUsd = exports.PERSONAL_PLAN_CONFIG = exports.PLAN_CONFIG = void 0;
exports.getConversationState = getConversationState;
exports.setConversationState = setConversationState;
exports.updateConversationContext = updateConversationContext;
exports.clearConversationState = clearConversationState;
exports.hasActiveOnboardingState = hasActiveOnboardingState;
exports.isInPaymentFlow = isInPaymentFlow;
exports.isInTrialState = isInTrialState;
exports.getHandlerForState = getHandlerForState;
const supabase_server_js_1 = require("./supabase-server.js");
const index_js_1 = require("../types/index.js");
Object.defineProperty(exports, "PLAN_CONFIG", { enumerable: true, get: function () { return index_js_1.PLAN_CONFIG; } });
Object.defineProperty(exports, "PERSONAL_PLAN_CONFIG", { enumerable: true, get: function () { return index_js_1.PERSONAL_PLAN_CONFIG; } });
Object.defineProperty(exports, "formatUsd", { enumerable: true, get: function () { return index_js_1.formatUsd; } });
Object.defineProperty(exports, "TRIAL_PLAN_LABEL", { enumerable: true, get: function () { return index_js_1.TRIAL_PLAN_LABEL; } });
/**
 * Get the current conversation state for a phone number.
 * Returns null if no state exists or if expired.
 */
async function getConversationState(phone) {
    const supabase = (0, supabase_server_js_1.getSupabaseAdmin)();
    const { data, error } = await supabase
        .from('conversation_state')
        .select('state, context_json, expires_at')
        .eq('phone', phone)
        .maybeSingle();
    if (error) {
        console.error('[bot-state] Error fetching conversation state:', error);
        return null;
    }
    if (!data)
        return null;
    // Check expiration
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
        // State expired - clean up
        await clearConversationState(phone);
        return null;
    }
    return {
        state: data.state,
        context: data.context_json || {},
    };
}
/**
 * Set the conversation state for a phone number.
 * Creates or updates the row with new state and context.
 */
async function setConversationState(phone, state, context = {}, expiresInHours = 72 // Default 3-day expiry for onboarding flow
) {
    const supabase = (0, supabase_server_js_1.getSupabaseAdmin)();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('conversation_state').upsert({
        phone,
        state,
        context_json: context,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
    });
    if (error) {
        console.error('[bot-state] Error setting conversation state:', error);
        return false;
    }
    return true;
}
/**
 * Update just the context of an existing conversation state.
 * Preserves current state and expiration.
 */
async function updateConversationContext(phone, contextUpdates) {
    const current = await getConversationState(phone);
    if (!current)
        return false;
    const mergedContext = { ...current.context, ...contextUpdates };
    return setConversationState(phone, current.state, mergedContext);
}
/**
 * Clear (delete) the conversation state for a phone number.
 */
async function clearConversationState(phone) {
    const supabase = (0, supabase_server_js_1.getSupabaseAdmin)();
    const { error } = await supabase.from('conversation_state').delete().eq('phone', phone);
    if (error) {
        console.error('[bot-state] Error clearing conversation state:', error);
        return false;
    }
    return true;
}
/**
 * Check if a phone number has an active onboarding/payment conversation.
 * Returns true if state is one of the "in-progress" states that should
 * intercept messages before they reach search/bid handlers.
 */
async function hasActiveOnboardingState(phone) {
    const stateData = await getConversationState(phone);
    if (!stateData)
        return false;
    const activeStates = [
        'LISTING_SUBMITTED',
        'AWAITING_ADMIN_REVIEW',
        'APPROVED_AWAITING_PACKAGE',
        'APPROVED_TRIAL_SELECTION',
        'AWAITING_ECOCASH_NUMBER',
        'PAYMENT_PENDING',
        'TRIAL_ACTIVE',
        'TRIAL_EXPIRING',
    ];
    return activeStates.includes(stateData.state);
}
/**
 * Check if a phone is in a payment-related state that should capture
 * EcoCash number input or payment confirmation.
 */
async function isInPaymentFlow(phone) {
    const stateData = await getConversationState(phone);
    if (!stateData)
        return false;
    const paymentStates = [
        'APPROVED_AWAITING_PACKAGE',
        'APPROVED_TRIAL_SELECTION',
        'AWAITING_ECOCASH_NUMBER',
        'PAYMENT_PENDING',
    ];
    return paymentStates.includes(stateData.state);
}
/**
 * Check if a phone is in a trial-related state.
 */
async function isInTrialState(phone) {
    const stateData = await getConversationState(phone);
    if (!stateData)
        return false;
    const trialStates = [
        'APPROVED_TRIAL_SELECTION',
        'TRIAL_ACTIVE',
        'TRIAL_EXPIRING',
        'TRIAL_EXPIRED',
    ];
    return trialStates.includes(stateData.state);
}
/**
 * Get the appropriate handler name for the current state.
 * Used for routing in webhook.
 */
function getHandlerForState(state) {
    switch (state) {
        case 'LISTING_SUBMITTED':
        case 'AWAITING_ADMIN_REVIEW':
            return 'handleOnboardingSubmitted';
        case 'APPROVED_AWAITING_PACKAGE':
            return 'handlePackageSelection';
        case 'APPROVED_TRIAL_SELECTION':
            return 'handleTrialSelection';
        case 'AWAITING_ECOCASH_NUMBER':
            return 'handleEcoCashNumber';
        case 'PAYMENT_PENDING':
            return 'handlePaymentPending';
        case 'ACTIVE':
            return 'handleActive';
        case 'TRIAL_ACTIVE':
        case 'TRIAL_EXPIRING':
        case 'TRIAL_EXPIRED':
            return 'handleTrialActive';
        case 'REJECTED':
            return 'handleRejected';
        case 'CANCELLED':
        case 'PAYMENT_FAILED':
        case 'EXPIRED':
            return 'handleTerminal';
        default:
            return null;
    }
}
