/**
 * Conversation state management for WhatsApp onboarding/payment flow.
 * Persists state in Supabase to prevent payment responses being interpreted
 * as searches/bids. Server-side only (service role).
 */

import { getSupabaseAdmin } from './supabase-server.js'
import { PLAN_CONFIG, PERSONAL_PLAN_CONFIG, formatUsd, TRIAL_PLAN_LABEL, type PlanType, type TrialStatus } from '../types/index.js'

/**
 * Re-export the single authoritative plan table from types/index.ts.
 * Do not declare prices here — bot, portal, admin and Paynow must all read
 * the same object, otherwise a user can see one amount and be charged another.
 */
export { PLAN_CONFIG, PERSONAL_PLAN_CONFIG, formatUsd, TRIAL_PLAN_LABEL }
export type { PlanType }

export type ConversationState =
  | 'LISTING_SUBMITTED'
  | 'AWAITING_ADMIN_REVIEW'
  | 'APPROVED_AWAITING_PACKAGE'
  | 'APPROVED_TRIAL_SELECTION'
  | 'AWAITING_ECOCASH_NUMBER'
  | 'PAYMENT_PENDING'
  | 'ACTIVE'
  | 'TRIAL_ACTIVE'
  | 'TRIAL_EXPIRING'
  | 'TRIAL_EXPIRED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'PAYMENT_FAILED'
  | 'EXPIRED'
  // Registration flow states
  | 'REGISTRATION_STARTED'
  | 'REGISTRATION_AWAITING_IMAGE'
  | 'REGISTRATION_PROCESSING_IMAGE'
  | 'REGISTRATION_REVIEW_EXTRACTED'
  | 'REGISTRATION_COLLECTING_FIELDS'
  | 'REGISTRATION_COLLECTING_OPTIONAL'
  | 'REGISTRATION_FINAL_REVIEW'
  | 'REGISTRATION_FLOW_ACTIVE'

export interface ConversationContext {
  businessId?: string
  businessName?: string
  category?: string
  city?: string
  listingId?: string
  subscriptionId?: string
  selectedPackage?: '1m' | '6m' | '12m'
  /** Plan chosen at the start of registration: free trial or paid. */
  approvedPlan?: 'trial' | PlanType
  trialRequested?: boolean
  ecocashNumber?: string
  paynowReference?: string
  paynowPollUrl?: string
  rejectionReason?: string
  adminNote?: string
  [key: string]: any
}

export interface ConversationStateRow {
  phone: string
  state: ConversationState
  context_json: ConversationContext
  expires_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Get the current conversation state for a phone number.
 * Returns null if no state exists or if expired.
 */
export async function getConversationState(
  phone: string
): Promise<{ state: ConversationState; context: ConversationContext } | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('conversation_state')
    .select('state, context_json, expires_at')
    .eq('phone', phone)
    .maybeSingle()

  if (error) {
    console.error('[bot-state] Error fetching conversation state:', error)
    return null
  }

  if (!data) return null

  // Check expiration
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    // State expired - clean up
    await clearConversationState(phone)
    return null
  }

  return {
    state: data.state as ConversationState,
    context: (data.context_json as ConversationContext) || {},
  }
}

/**
 * Set the conversation state for a phone number.
 * Creates or updates the row with new state and context.
 */
export async function setConversationState(
  phone: string,
  state: ConversationState,
  context: ConversationContext = {},
  expiresInHours = 72 // Default 3-day expiry for onboarding flow
): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from('conversation_state').upsert({
    phone,
    state,
    context_json: context,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  })

  if (error) {
    console.error('[bot-state] Error setting conversation state:', error)
    return false
  }
  return true
}

/**
 * Update just the context of an existing conversation state.
 * Preserves current state and expiration.
 */
export async function updateConversationContext(
  phone: string,
  contextUpdates: Partial<ConversationContext>
): Promise<boolean> {
  const current = await getConversationState(phone)
  if (!current) return false

  const mergedContext = { ...current.context, ...contextUpdates }
  return setConversationState(phone, current.state, mergedContext)
}

/**
 * Clear (delete) the conversation state for a phone number.
 */
export async function clearConversationState(phone: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('conversation_state').delete().eq('phone', phone)

  if (error) {
    console.error('[bot-state] Error clearing conversation state:', error)
    return false
  }
  return true
}

/**
 * Check if a phone number has an active onboarding/payment conversation.
 * Returns true if state is one of the "in-progress" states that should
 * intercept messages before they reach search/bid handlers.
 */
export async function hasActiveOnboardingState(phone: string): Promise<boolean> {
  const stateData = await getConversationState(phone)
  if (!stateData) return false

  const activeStates: ConversationState[] = [
    'LISTING_SUBMITTED',
    'AWAITING_ADMIN_REVIEW',
    'APPROVED_AWAITING_PACKAGE',
    'APPROVED_TRIAL_SELECTION',
    'AWAITING_ECOCASH_NUMBER',
    'PAYMENT_PENDING',
    'TRIAL_ACTIVE',
    'TRIAL_EXPIRING',
  ]
  return activeStates.includes(stateData.state)
}

/**
 * Check if a phone is in a payment-related state that should capture
 * EcoCash number input or payment confirmation.
 */
export async function isInPaymentFlow(phone: string): Promise<boolean> {
  const stateData = await getConversationState(phone)
  if (!stateData) return false

  const paymentStates: ConversationState[] = [
    'APPROVED_AWAITING_PACKAGE',
    'APPROVED_TRIAL_SELECTION',
    'AWAITING_ECOCASH_NUMBER',
    'PAYMENT_PENDING',
  ]
  return paymentStates.includes(stateData.state)
}

/**
 * Check if a phone is in a trial-related state.
 */
export async function isInTrialState(phone: string): Promise<boolean> {
  const stateData = await getConversationState(phone)
  if (!stateData) return false

  const trialStates: ConversationState[] = [
    'APPROVED_TRIAL_SELECTION',
    'TRIAL_ACTIVE',
    'TRIAL_EXPIRING',
    'TRIAL_EXPIRED',
  ]
  return trialStates.includes(stateData.state)
}

/**
 * Get the appropriate handler name for the current state.
 * Used for routing in webhook.
 */
export function getHandlerForState(state: ConversationState): string | null {
  switch (state) {
    case 'LISTING_SUBMITTED':
    case 'AWAITING_ADMIN_REVIEW':
      return 'handleOnboardingSubmitted'
    case 'APPROVED_AWAITING_PACKAGE':
      return 'handlePackageSelection'
    case 'APPROVED_TRIAL_SELECTION':
      return 'handleTrialSelection'
    case 'AWAITING_ECOCASH_NUMBER':
      return 'handleEcoCashNumber'
    case 'PAYMENT_PENDING':
      return 'handlePaymentPending'
    case 'ACTIVE':
      return 'handleActive'
    case 'TRIAL_ACTIVE':
    case 'TRIAL_EXPIRING':
    case 'TRIAL_EXPIRED':
      return 'handleTrialActive'
    case 'REJECTED':
      return 'handleRejected'
    case 'CANCELLED':
    case 'PAYMENT_FAILED':
    case 'EXPIRED':
      return 'handleTerminal'
    default:
      return null
  }
}