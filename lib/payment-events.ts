// Audit logging for the payment flow. Logging must NEVER break the payment
// path: every failure mode (missing env, DB down, bad data) is swallowed and
// only reported to the server console.
//
// Events recorded (event_type / outcome):
//   bid_rejected        · validation or auction-rule rejection
//   payment_initiated   · Paynow accepted the EcoCash initiation
//   payment_init_failed · Paynow refused / unreachable
//   payment_confirmed   · Paynow reported the transaction paid
//   payment_pending     · still awaiting the payer's PIN
//   webhook_rejected    · invalid hash, replay, poll mismatch, unknown ref
//   activation_failed   · paid but the #1 takeover insert failed
//   activation          · #1 takeover completed

import { createHash } from 'crypto'
import { getSupabase } from './supabase-server.js'

type PaymentEventOutcome = 'ok' | 'error' | 'rejected' | 'pending'

export interface PaymentEventInput {
  eventType: string
  outcome?: PaymentEventOutcome
  bidId?: string | null
  businessId?: string | null
  detail?: Record<string, unknown>
  request?: Request
}

// Best-effort client IP behind Vercel's proxy.
function clientIp(req: Request): string {
  const h = req.headers
  return (
    h.get('x-real-ip') ||
    h.get('cf-connecting-ip') ||
    (h.get('x-forwarded-for') || '').split(',')[0].trim() ||
    ''
  )
}

// IPs are hashed — an audit log shouldn't become a PII liability of its own.
function hashIp(ip: string): string {
  if (!ip) return ''
  const secret = process.env.BUSINESS_AUTH_SECRET || 'wa-directory-ip-hash'
  return createHash('sha256').update(`${secret}:${ip}`).digest('hex').slice(0, 32)
}

export async function logPaymentEvent(input: PaymentEventInput): Promise<void> {
  try {
    const req = input.request
    const ip = req ? hashIp(clientIp(req)) : null
    const ua = req ? req.headers.get('user-agent') || null : null

    const { error } = await getSupabase().from('payment_events').insert({
      bid_id: input.bidId || null,
      business_id: input.businessId || null,
      event_type: input.eventType,
      outcome: input.outcome || 'ok',
      detail: input.detail || {},
      ip_hash: ip,
      user_agent: ua,
    })
    if (error) {
      console.error('[payment-events] insert failed:', error.message)
    }
  } catch (err) {
    console.error('[payment-events] logging failed:', err instanceof Error ? err.message : err)
  }
}
