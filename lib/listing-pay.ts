// Core listing-subscription payment engine, shared by webapp and chatbot.
import { getSupabase } from './supabase-server.js'
import { SITE_URL } from './site-url.js'
import { digitsOnly } from './phone.js'
import { PLAN_CONFIG, PRO_ASSISTANCE_PRICE, type PlanType } from '../types/index.js'

export interface CreateListingPaymentInput {
  businessId: string
  payerPhone: string
  plan: PlanType
  hasProAssistance?: boolean
  amountOverride?: number
}

export interface PaymentAdapters {
  initiateEcoCashPayment?: (params: { reference: string; amount: number; phone: string; additionalInfo: string; resultUrl: string }) => Promise<{ ok: boolean; pollUrl?: string; paynowReference?: string; instructions?: string; error?: string }>
  logPaymentEvent?: (params: { eventType: string; businessId: string; detail?: Record<string, unknown>; request?: Request }) => Promise<void>
  sendWhatsAppMessage?: (phone: string, text: string) => Promise<void>
}

export type CreateListingPaymentResult =
  | { ok: true; autoEcoCash: boolean; instructions: string | null; message: string }
  | { ok: false; status: number; error: string }

export function paymentAmountFor(plan: PlanType, hasProAssistance?: boolean): number {
  return PLAN_CONFIG[plan].price + (hasProAssistance ? PRO_ASSISTANCE_PRICE : 0)
}

export async function createListingPayment(
  input: CreateListingPaymentInput,
  adapters?: PaymentAdapters
): Promise<CreateListingPaymentResult> {
  const payerClean = digitsOnly(input.payerPhone)
  if (payerClean.length < 9) {
    return { ok: false, status: 400, error: 'Invalid payer phone number' }
  }

  const supabase = getSupabase()

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
  ])

  if (!business) {
    return { ok: false, status: 404, error: 'Business not found' }
  }

  const bizId = (business as { id: string }).id

  if (business.payment_status === 'active') {
    return { ok: false, status: 400, error: 'This listing is already active' }
  }

  const isFree = business.category?.some((c: string) =>
    (specialCats || []).some(sc => sc.name === c)
  )
  if (isFree) {
    return { ok: false, status: 400, error: 'Yellow Pages listings are free' }
  }

  const { data: existing } = await supabase
    .from('listing_subscriptions')
    .select('id')
    .eq('business_id', bizId)
    .eq('status', 'pending')
    .maybeSingle()

  const amount = input.amountOverride ?? paymentAmountFor(input.plan, input.hasProAssistance)
  const planLabel = input.amountOverride != null ? 'Personal contact' : PLAN_CONFIG[input.plan].label

  let subscriptionId: string
  if (existing) {
    subscriptionId = existing.id
    await supabase
      .from('listing_subscriptions')
      .update({ payer_phone: payerClean, amount, plan: input.plan, pro_assistance: !!input.hasProAssistance })
      .eq('id', existing.id)
  } else {
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
      .single()
    if (inserted.error || !inserted.data) {
      return { ok: false, status: 500, error: inserted.error?.message || 'Could not create the payment record' }
    }
    subscriptionId = inserted.data.id
  }

  await supabase
    .from('businesses')
    .update({ payment_status: 'pending' })
    .eq('id', bizId)

  let autoPayment: { initiated: boolean; instructions?: string } = { initiated: false }
  if (adapters?.initiateEcoCashPayment && process.env.PAYNOW_INTEGRATION_ID && process.env.PAYNOW_INTEGRATION_KEY) {
    const init = await adapters.initiateEcoCashPayment({
      reference: `LISTING-${subscriptionId}`,
      amount,
      phone: payerClean,
      additionalInfo: `WA Directory listing: ${(business as { name: string }).name} (${planLabel})`,
      resultUrl: `${SITE_URL}/api/paynow/result`,
    })
    if (init.ok && init.pollUrl) {
      await supabase
        .from('listing_subscriptions')
        .update({ paynow_poll_url: init.pollUrl, paynow_reference: init.paynowReference || null })
        .eq('id', subscriptionId)
      autoPayment = { initiated: true, instructions: init.instructions }
      await adapters.logPaymentEvent?.({
        eventType: 'payment_initiated',
        businessId: bizId,
        detail: { via: 'listing_pay', plan: input.plan, amount, paynowRef: init.paynowReference },
      })
    }
  }

  if (process.env.ADMIN_WHATSAPP && adapters?.sendWhatsAppMessage) {
    await adapters.sendWhatsAppMessage(
      process.env.ADMIN_WHATSAPP,
      [
        autoPayment.initiated ? '💰 *AUTOMATIC PAYMENT IN PROGRESS*' : '💰 *PAYMENT REQUEST*',
        '',
        `Business: ${(business as { name: string }).name}`,
        `Username: @${(business as { username?: string | null }).username || 'N/A'}`,
        `Plan: ${planLabel}`,
        `Amount: USD ${amount.toFixed(2)}`,
        input.hasProAssistance ? 'Add-on: Pro WhatsApp catalog setup' : '',
        `Payer EcoCash: +${payerClean}`,
        '',
        autoPayment.initiated
          ? 'EcoCash prompt sent to the payer. It will auto-confirm without admin action if they pay.'
          : `Check EcoCash for transaction from +${payerClean}`,
        autoPayment.initiated ? '' : `Review: ${SITE_URL}/admin`,
      ].filter(Boolean).join('\n')
    )
  }

  return {
    ok: true,
    autoEcoCash: autoPayment.initiated,
    instructions: autoPayment.instructions || null,
    message: autoPayment.initiated
      ? 'An EcoCash prompt was sent to your phone. Enter your PIN and your listing goes live automatically.'
      : 'Payment request submitted. Admin will verify and activate shortly.',
  }
}