/**
 * Conversation state management for WhatsApp onboarding/payment flow.
 * Persists state in Supabase to prevent payment responses being interpreted
 * as searches/bids. Server-side only (service role).
 */
import { PLAN_CONFIG, PERSONAL_PLAN_CONFIG, formatUsd, TRIAL_PLAN_LABEL, type PlanType } from '../types/index.js';
/**
 * Re-export the single authoritative plan table from types/index.ts.
 * Do not declare prices here — bot, portal, admin and Paynow must all read
 * the same object, otherwise a user can see one amount and be charged another.
 */
export { PLAN_CONFIG, PERSONAL_PLAN_CONFIG, formatUsd, TRIAL_PLAN_LABEL };
export type { PlanType };
export type ConversationState = 'LISTING_SUBMITTED' | 'AWAITING_ADMIN_REVIEW' | 'APPROVED_AWAITING_PACKAGE' | 'APPROVED_TRIAL_SELECTION' | 'AWAITING_ECOCASH_NUMBER' | 'PAYMENT_PENDING' | 'ACTIVE' | 'TRIAL_ACTIVE' | 'TRIAL_EXPIRING' | 'TRIAL_EXPIRED' | 'REJECTED' | 'CANCELLED' | 'PAYMENT_FAILED' | 'EXPIRED' | 'REGISTRATION_STARTED' | 'REGISTRATION_AWAITING_IMAGE' | 'REGISTRATION_PROCESSING_IMAGE' | 'REGISTRATION_REVIEW_EXTRACTED' | 'REGISTRATION_COLLECTING_FIELDS' | 'REGISTRATION_COLLECTING_OPTIONAL' | 'REGISTRATION_FINAL_REVIEW' | 'REGISTRATION_FLOW_ACTIVE';
export interface ConversationContext {
    businessId?: string;
    businessName?: string;
    category?: string;
    city?: string;
    listingId?: string;
    subscriptionId?: string;
    selectedPackage?: '1m' | '6m' | '12m';
    /** Plan chosen at the start of registration: free trial or paid. */
    approvedPlan?: 'trial' | PlanType;
    trialRequested?: boolean;
    ecocashNumber?: string;
    paynowReference?: string;
    paynowPollUrl?: string;
    rejectionReason?: string;
    adminNote?: string;
    [key: string]: any;
}
export interface ConversationStateRow {
    phone: string;
    state: ConversationState;
    context_json: ConversationContext;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
}
/**
 * Get the current conversation state for a phone number.
 * Returns null if no state exists or if expired.
 */
export declare function getConversationState(phone: string): Promise<{
    state: ConversationState;
    context: ConversationContext;
} | null>;
/**
 * Set the conversation state for a phone number.
 * Creates or updates the row with new state and context.
 */
export declare function setConversationState(phone: string, state: ConversationState, context?: ConversationContext, expiresInHours?: number): Promise<boolean>;
/**
 * Update just the context of an existing conversation state.
 * Preserves current state and expiration.
 */
export declare function updateConversationContext(phone: string, contextUpdates: Partial<ConversationContext>): Promise<boolean>;
/**
 * Clear (delete) the conversation state for a phone number.
 */
export declare function clearConversationState(phone: string): Promise<boolean>;
/**
 * Check if a phone number has an active onboarding/payment conversation.
 * Returns true if state is one of the "in-progress" states that should
 * intercept messages before they reach search/bid handlers.
 */
export declare function hasActiveOnboardingState(phone: string): Promise<boolean>;
/**
 * Check if a phone is in a payment-related state that should capture
 * EcoCash number input or payment confirmation.
 */
export declare function isInPaymentFlow(phone: string): Promise<boolean>;
/**
 * Check if a phone is in a trial-related state.
 */
export declare function isInTrialState(phone: string): Promise<boolean>;
/**
 * Get the appropriate handler name for the current state.
 * Used for routing in webhook.
 */
export declare function getHandlerForState(state: ConversationState): string | null;
//# sourceMappingURL=bot-state.d.ts.map