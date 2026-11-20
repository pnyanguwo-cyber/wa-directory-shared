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
import { TRIAL_DAYS, TRIAL_PLAN_LABEL, type TrialStatus } from '../types/index.js';
export { TRIAL_DAYS, TRIAL_PLAN_LABEL };
export interface TrialSubscriptionRow {
    id: string;
    business_id: string;
    status: string;
    amount: number;
    plan: string | null;
    started_at: string | null;
    expires_at: string | null;
    trial_eligible: boolean;
    trial_status: TrialStatus | null;
    is_trial: boolean;
    trial_requested_at: string | null;
    trial_activated_at: string | null;
    trial_expires_at: string | null;
    trial_reminder_sent_7d: boolean;
    trial_reminder_sent_3d: boolean;
}
/** Has this business already used (or requested) its one free trial? */
export declare function hasTrialHistory(businessId: string): Promise<boolean>;
/** True when a business has a live paid (non-trial) subscription. */
export declare function hasActivePaidSubscription(businessId: string): Promise<boolean>;
/**
 * Eligibility for *requesting* a trial. Only businesses without an active
 * paid subscription, without prior trial history and outside special
 * (Yellow Pages / public-service) categories qualify.
 */
export declare function isTrialEligible(businessId: string): Promise<{
    eligible: boolean;
    reason?: string;
}>;
/**
 * Record a trial request without starting the clock. Called when the owner
 * chooses the trial during registration, or from the portal before approval.
 */
export declare function requestTrial(businessId: string): Promise<{
    ok: boolean;
    error?: string;
}>;
/**
 * Start the 90-day trial. Refuses until the listing has been approved and
 * published (verified) unless the caller is an admin override.
 */
export declare function startTrialForBusiness(businessId: string, opts?: {
    adminOverride?: boolean;
}): Promise<{
    ok: boolean;
    error?: string;
    trialExpiresAt?: string;
    business?: {
        id: string;
        name: string;
        phone: string | null;
        slug: string | null;
        username: string | null;
    };
}>;
/** Get the trial end date (90 days from activation). */
export declare function getTrialEndDate(activatedAt?: string): Date;
/** Check if a trial is still active. */
export declare function isTrialActive(trialActivatedAt?: string, trialExpiresAt?: string): boolean;
export declare function isTrialExpiringSoon(trialExpiresAt?: string): boolean;
export declare function isTrialExpiringSoon3Days(trialExpiresAt?: string): boolean;
export declare function getDaysRemaining(trialExpiresAt?: string): number;
/** Convert stored row fields into the visible lifecycle state. */
export declare function getTrialStatus(row: {
    trial_status?: string | null;
    trial_activated_at?: string | null;
    trial_expires_at?: string | null;
    is_trial?: boolean | null;
}): TrialStatus;
export declare function formatTrialStatus(trialActivatedAt?: string | null, trialExpiresAt?: string | null, storedStatus?: string | null): string;
/** Trial price display (always $0 — no payment is ever taken). */
export declare function getTrialPriceDisplay(): string;
export declare function getTrialPlanLabel(): string;
//# sourceMappingURL=trial-helpers.d.ts.map