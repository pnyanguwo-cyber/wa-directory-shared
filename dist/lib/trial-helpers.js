"use strict";
/**
 * Trial eligibility and lifecycle for the 90-day business free trial.
 *
 * A trial is a real subscription state, not a promotional message:
 *   requested -> active -> expiring -> expired -> (paid active)
 *
 * It is recorded on listing_subscriptions with is_trial = true and
 * trial_status set, amount 0, and its own 90-day start/expiry dates. A paid
 * subscription is a separate row (or the same row converted) with
 * is_trial = false and the normal PLAN_CONFIG price.
 *
 * Activation rule: a trial may only start after an administrator has
 * approved and published the listing. Registration/submission only records a
 * *request* (trial_status = 'requested'); they never start the clock.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRIAL_PLAN_LABEL = exports.TRIAL_DAYS = void 0;
exports.hasTrialHistory = hasTrialHistory;
exports.hasActivePaidSubscription = hasActivePaidSubscription;
exports.isTrialEligible = isTrialEligible;
exports.requestTrial = requestTrial;
exports.startTrialForBusiness = startTrialForBusiness;
exports.getTrialEndDate = getTrialEndDate;
exports.isTrialActive = isTrialActive;
exports.isTrialExpiringSoon = isTrialExpiringSoon;
exports.isTrialExpiringSoon3Days = isTrialExpiringSoon3Days;
exports.getDaysRemaining = getDaysRemaining;
exports.getTrialStatus = getTrialStatus;
exports.formatTrialStatus = formatTrialStatus;
exports.getTrialPriceDisplay = getTrialPriceDisplay;
exports.getTrialPlanLabel = getTrialPlanLabel;
const supabase_server_js_1 = require("./supabase-server.js");
const index_js_1 = require("../types/index.js");
Object.defineProperty(exports, "TRIAL_DAYS", { enumerable: true, get: function () { return index_js_1.TRIAL_DAYS; } });
Object.defineProperty(exports, "TRIAL_PLAN_LABEL", { enumerable: true, get: function () { return index_js_1.TRIAL_PLAN_LABEL; } });
const onboarding_log_js_1 = require("./onboarding-log.js");
const TRIAL_MS = index_js_1.TRIAL_DAYS * 24 * 60 * 60 * 1000;
const USED_TRIAL_STATUSES = ['active', 'expiring', 'expired', 'converted'];
function trialStatusOf(row) {
    const stored = (row.trial_status || 'none');
    if (stored && stored !== 'none')
        return stored;
    if (!row.trial_activated_at)
        return 'none';
    if (!row.trial_expires_at)
        return 'active';
    const expires = new Date(row.trial_expires_at).getTime();
    if (expires <= Date.now())
        return 'expired';
    if (expires - Date.now() <= 7 * 86400000)
        return 'expiring';
    return 'active';
}
/** Has this business already used (or requested) its one free trial? */
async function hasTrialHistory(businessId) {
    const supabase = (0, supabase_server_js_1.getSupabase)();
    const { data, error } = await supabase
        .from('listing_subscriptions')
        .select('id, trial_status, trial_activated_at, trial_requested_at, is_trial')
        .eq('business_id', businessId);
    if (error) {
        console.error('[trial] history lookup failed:', error.message);
        return true; // Fail closed: never hand out a second trial on a DB error.
    }
    return (data || []).some(row => {
        if (row.trial_requested_at || row.trial_activated_at)
            return true;
        const status = trialStatusOf(row);
        if (USED_TRIAL_STATUSES.includes(status) || status === 'requested')
            return true;
        return row.is_trial === true && status !== 'none';
    });
}
/** True when a business has a live paid (non-trial) subscription. */
async function hasActivePaidSubscription(businessId) {
    const supabase = (0, supabase_server_js_1.getSupabase)();
    const { data } = await supabase
        .from('listing_subscriptions')
        .select('id, expires_at, is_trial, trial_status')
        .eq('business_id', businessId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!data)
        return false;
    if (data.is_trial === true || trialStatusOf(data) !== 'none')
        return false;
    return !data.expires_at || new Date(data.expires_at) > new Date();
}
/**
 * Eligibility for *requesting* a trial. Only businesses without an active
 * paid subscription, without prior trial history and outside special
 * (Yellow Pages / public-service) categories qualify.
 */
async function isTrialEligible(businessId) {
    const supabase = (0, supabase_server_js_1.getSupabase)();
    const { data: business, error: bizError } = await supabase
        .from('businesses')
        .select('id, category, payment_status')
        .eq('id', businessId)
        .single();
    if (bizError || !business) {
        return { eligible: false, reason: 'Business not found' };
    }
    if (await hasActivePaidSubscription(businessId)) {
        return { eligible: false, reason: 'Already has an active paid subscription' };
    }
    if (await hasTrialHistory(businessId)) {
        return { eligible: false, reason: 'This business has already used its free trial' };
    }
    // Public-service (special) categories are free and must stay free.
    const categoryNames = Array.isArray(business.category) ? business.category : [];
    if (categoryNames.length > 0) {
        const { data: specialCats } = await supabase
            .from('categories')
            .select('name')
            .eq('special', true)
            .in('name', categoryNames);
        if (specialCats && specialCats.length > 0) {
            return { eligible: false, reason: 'Cannot trial in a public-service category' };
        }
    }
    return { eligible: true };
}
/**
 * Record a trial request without starting the clock. Called when the owner
 * chooses the trial during registration, or from the portal before approval.
 */
async function requestTrial(businessId) {
    const eligibility = await isTrialEligible(businessId);
    if (!eligibility.eligible) {
        return { ok: false, error: eligibility.reason || 'Not eligible for a trial' };
    }
    const supabase = (0, supabase_server_js_1.getSupabase)();
    const { data: existingRows } = await supabase
        .from('listing_subscriptions')
        .select('id, trial_status, trial_requested_at, is_trial')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });
    // Never overwrite a paid history row with trial data.
    const existing = (existingRows || []).find(row => row.is_trial === true || !!row.trial_requested_at || row.trial_status === 'requested');
    const values = {
        status: 'pending',
        amount: 0,
        plan: '1m',
        is_trial: true,
        trial_eligible: true,
        trial_status: 'requested',
        trial_requested_at: new Date().toISOString(),
    };
    const { error } = existing
        ? await supabase.from('listing_subscriptions').update(values).eq('id', existing.id)
        : await supabase.from('listing_subscriptions').insert({ business_id: businessId, ...values });
    if (error) {
        console.error('[trial] request failed:', error.message);
        return { ok: false, error: 'Could not record the trial request' };
    }
    (0, onboarding_log_js_1.logOnboarding)('trial_requested', { businessId, status: 'requested' });
    return { ok: true };
}
/**
 * Start the 90-day trial. Refuses until the listing has been approved and
 * published (verified) unless the caller is an admin override.
 */
async function startTrialForBusiness(businessId, opts = {}) {
    const supabase = (0, supabase_server_js_1.getSupabase)();
    const { data: business, error: bizError } = await supabase
        .from('businesses')
        .select('id, name, phone, slug, username, category, verified, payment_status')
        .eq('id', businessId)
        .single();
    if (bizError || !business)
        return { ok: false, error: 'Business not found' };
    if (!opts.adminOverride && business.verified !== true) {
        return { ok: false, error: 'The listing must be approved and published before the trial can start' };
    }
    if (await hasActivePaidSubscription(businessId)) {
        return { ok: false, error: 'Business already has an active paid subscription' };
    }
    // A prior *activated* trial permanently disqualifies the business; a pending
    // request does not (this is the request being fulfilled).
    const { data: history } = await supabase
        .from('listing_subscriptions')
        .select('id, trial_status, trial_activated_at, trial_requested_at, is_trial, created_at')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });
    const alreadyActivated = (history || []).some(row => !!row.trial_activated_at);
    if (alreadyActivated) {
        return { ok: false, error: 'This business has already used its free trial' };
    }
    const now = new Date();
    const trialExpiresAt = new Date(now.getTime() + TRIAL_MS);
    const values = {
        status: 'active',
        amount: 0,
        plan: '1m',
        is_trial: true,
        trial_eligible: true,
        trial_status: 'active',
        trial_activated_at: now.toISOString(),
        trial_expires_at: trialExpiresAt.toISOString(),
        trial_reminder_sent_7d: false,
        trial_reminder_sent_3d: false,
        started_at: now.toISOString(),
        expires_at: trialExpiresAt.toISOString(),
    };
    // Only reuse the pending request row. A paid row must keep its own amount
    // and dates, so a trial always has a distinct record from paid history.
    const target = (history || []).find(row => row.is_trial === true || !!row.trial_requested_at || row.trial_status === 'requested');
    const { error: subError } = target
        ? await supabase.from('listing_subscriptions').update(values).eq('id', target.id)
        : await supabase.from('listing_subscriptions').insert({ business_id: businessId, ...values });
    if (subError) {
        console.error('[trial] activation failed:', subError.message);
        return { ok: false, error: 'Could not activate the trial' };
    }
    // Publishing/activating the trial also publishes the listing.
    const { error: bizUpdateError } = await supabase
        .from('businesses')
        .update({
        payment_status: 'active',
        verified: true,
        listing_activated_at: now.toISOString(),
    })
        .eq('id', businessId);
    if (bizUpdateError) {
        console.error('[trial] business activation failed:', bizUpdateError.message);
        return { ok: false, error: 'Trial saved but the listing could not be published' };
    }
    (0, onboarding_log_js_1.logOnboarding)('trial_activated', {
        businessId,
        trialExpiresAt: trialExpiresAt.toISOString(),
        phone: (0, onboarding_log_js_1.maskPhone)(business.phone || ''),
    });
    return {
        ok: true,
        trialExpiresAt: trialExpiresAt.toISOString(),
        business: {
            id: business.id,
            name: business.name,
            phone: business.phone,
            slug: business.slug,
            username: business.username,
        },
    };
}
/** Get the trial end date (90 days from activation). */
function getTrialEndDate(activatedAt) {
    const base = activatedAt ? new Date(activatedAt) : new Date();
    return new Date(base.getTime() + TRIAL_MS);
}
/** Check if a trial is still active. */
function isTrialActive(trialActivatedAt, trialExpiresAt) {
    if (!trialActivatedAt || !trialExpiresAt)
        return false;
    return new Date() < new Date(trialExpiresAt);
}
function isTrialExpiringSoon(trialExpiresAt) {
    if (!trialExpiresAt)
        return false;
    const diff = new Date(trialExpiresAt).getTime() - Date.now();
    return diff > 0 && diff <= 7 * 86400000;
}
function isTrialExpiringSoon3Days(trialExpiresAt) {
    if (!trialExpiresAt)
        return false;
    const diff = new Date(trialExpiresAt).getTime() - Date.now();
    return diff > 0 && diff <= 3 * 86400000;
}
function getDaysRemaining(trialExpiresAt) {
    if (!trialExpiresAt)
        return 0;
    return Math.ceil((new Date(trialExpiresAt).getTime() - Date.now()) / 86400000);
}
/** Convert stored row fields into the visible lifecycle state. */
function getTrialStatus(row) {
    return trialStatusOf(row);
}
function formatTrialStatus(trialActivatedAt, trialExpiresAt, storedStatus) {
    const status = trialStatusOf({
        trial_status: storedStatus,
        trial_activated_at: trialActivatedAt,
        trial_expires_at: trialExpiresAt,
    });
    if (status === 'requested')
        return 'Trial requested — starts when your listing is approved';
    if (status === 'none')
        return 'No trial active';
    if (status === 'expired')
        return 'Trial expired';
    if (status === 'converted')
        return 'Trial converted to paid';
    const daysRem = getDaysRemaining(trialExpiresAt || undefined);
    if (daysRem <= 0)
        return 'Trial expired';
    if (daysRem <= 3)
        return `Trial expires in ${daysRem} day${daysRem !== 1 ? 's' : ''} — renew soon`;
    if (daysRem <= 7)
        return `Trial expires in ${daysRem} days`;
    return `Trial active — ${daysRem} days remaining`;
}
/** Trial price display (always $0 — no payment is ever taken). */
function getTrialPriceDisplay() {
    return 'FREE';
}
function getTrialPlanLabel() {
    return index_js_1.TRIAL_PLAN_LABEL;
}
