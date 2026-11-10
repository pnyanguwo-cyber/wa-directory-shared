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

import { sendWhatsAppMessage, sendInteractiveButtons } from './whatsapp.js'
import {
  setConversationState,
  getConversationState,
  updateConversationContext,
  clearConversationState,
} from './bot-state.js'
import { analyseBusinessMaterial, RegistrationFields } from './ai-registration.js'
import { categories, matchCategory } from '../data/categories.js'
import { createListing } from './listing-create.js'
import { requestTrial } from './trial-helpers.js'
import { PLAN_CONFIG, TRIAL_PLAN_LABEL, formatUsd, type PlanType, type TrialStatus } from '../types/index.js'
import { getSupabase } from './supabase-server.js'
import { logOnboarding, maskPhone } from './onboarding-log.js'

const CATEGORY_NAMES = categories.map(c => c.name)

/** The five details createListing cannot do without. */
const REQUIRED_FIELDS = ['business_name', 'category', 'phone', 'city', 'description'] as const
type RequiredField = (typeof REQUIRED_FIELDS)[number]

const FIELD_LABELS: Record<RequiredField, string> = {
  business_name: 'Business name',
  category: 'Category',
  phone: 'WhatsApp / phone number',
  city: 'City or town',
  description: 'What your business offers',
}

export const REGISTRATION_BUTTONS = {
  upload: 'reg_upload',
  skip: 'reg_skip',
  proceed: 'reg_proceed',
  edit: 'reg_edit',
  planTrial: 'reg_plan_trial',
  planPaid: 'reg_plan_paid',
} as const

function imageFirstMessage(planLabel: string) {
  return (
    `🏪 *Let's get your business listed!*\n\n` +
    `You chose: *${planLabel}*\n\n` +
    `Have a business card, flyer, banner or advert? Send us a picture and our AI ` +
    `will extract the business information it can identify, saving you time.\n\n` +
    `You can also skip this step and enter your details manually.`
  )
}

async function sendPlanChoice(phone: string) {
  await setConversationState(phone, 'REGISTRATION_STARTED', { step: 'choose_plan' })
  logOnboarding('registration_plan_menu', { phone: maskPhone(phone) })

  const paid = PLAN_CONFIG['1m']
  await sendInteractiveButtons(
    phone,
    `🏪 *Business listing — choose how to activate*\n\n` +
      `🆓 *${TRIAL_PLAN_LABEL}* — no payment required. Starts only after an administrator approves your listing. One trial per business.\n\n` +
      `💳 *${paid.label}* — USD ${formatUsd(paid.price)} per month via EcoCash.\n\n` +
      `Which option would you like?`,
    [
      { id: REGISTRATION_BUTTONS.planTrial, title: '90-Day Free Trial' },
      { id: REGISTRATION_BUTTONS.planPaid, title: `USD ${formatUsd(paid.price)}/month` },
    ]
  )
}

async function sendImageFirst(phone: string, plan: 'trial' | PlanType) {
  const planLabel = plan === 'trial' ? TRIAL_PLAN_LABEL : PLAN_CONFIG[plan].label
  await setConversationState(phone, 'REGISTRATION_AWAITING_IMAGE', {
    step: 'choose_material',
    approvedPlan: plan,
    trialRequested: plan === 'trial',
  })
  logOnboarding('registration_image_first', {
    phone: maskPhone(phone),
    plan,
  })

  await sendInteractiveButtons(phone, imageFirstMessage(planLabel), [
    { id: REGISTRATION_BUTTONS.upload, title: '📷 Send a picture' },
    { id: REGISTRATION_BUTTONS.skip, title: 'Skip and enter manually' },
  ])
}

/** Pick the trial or paid plan, then immediately offer the upload step. */
export async function chooseRegistrationPlan(phone: string, choice: string): Promise<boolean> {
  const lower = (choice || '').toLowerCase().trim()
  let plan: 'trial' | PlanType | null = null

  if (
    lower === REGISTRATION_BUTTONS.planTrial ||
    lower === 'trial' ||
    lower === 'free' ||
    lower === '1' ||
    lower.includes('trial')
  ) {
    plan = 'trial'
  } else if (
    lower === REGISTRATION_BUTTONS.planPaid ||
    lower === 'paid' ||
    lower === '2' ||
    lower === '1m' ||
    lower.includes('2')
  ) {
    plan = '1m'
  }

  if (!plan) return false

  logOnboarding('registration_plan_selected', { phone: maskPhone(phone), plan })
  await sendImageFirst(phone, plan)
  return true
}

/**
 * Entry point. Resumes an in-progress registration instead of creating a
 * second session; otherwise starts with the plan choice.
 */
export async function startRegistrationFlow(phone: string, opts: { force?: boolean } = {}) {
  if (!opts.force) {
    const existing = await getConversationState(phone)
    const state = existing?.state || ''
    const context = existing?.context || {}

    if (state.startsWith('REGISTRATION_') && state !== 'REGISTRATION_PROCESSING_IMAGE') {
      logOnboarding('registration_resumed', { phone: maskPhone(phone), state, step: context.step })
      if (state === 'REGISTRATION_AWAITING_IMAGE') {
        if (context.approvedPlan) {
          await sendImageFirst(phone, context.approvedPlan)
        } else {
          await sendPlanChoice(phone)
        }
      } else if (state === 'REGISTRATION_FINAL_REVIEW' && context.listing) {
        await showFinalReview(phone, context)
      } else if (state === 'REGISTRATION_COLLECTING_FIELDS') {
        await sendWhatsAppMessage(
          phone,
          `📝 Continuing your registration.\n\n${getPromptForField(
            (context.missing || [])[context.currentMissingIndex || 0] || 'business_name'
          )}\n\n(Type *cancel* at any time to abort)`
        )
      } else {
        await sendPlanChoice(phone)
      }
      return
    }
  }

  await sendPlanChoice(phone)
}

function startManualCollection(phone: string, context: any, opts: { collected?: RegistrationFields } = {}) {
  const fields = opts.collected || (context.fields as RegistrationFields) || ({} as RegistrationFields)
  const missing = REQUIRED_FIELDS.filter(key => !fields?.[key]?.value)
  const index = 0

  return setConversationState(phone, 'REGISTRATION_COLLECTING_FIELDS', {
    ...context,
    step: 'collecting_fields',
    manual: true,
    fields,
    missing,
    currentMissingIndex: index,
  })
}

export async function handleRegistrationMessage(phone: string, text: string, context: any) {
  const lower = text.toLowerCase().trim()

  if (lower === 'cancel' || lower === 'quit' || lower === 'stop') {
    await clearConversationState(phone)
    logOnboarding('registration_cancelled', { phone: maskPhone(phone) })
    await sendWhatsAppMessage(phone, '❌ Registration cancelled. Type *register* whenever you are ready to start again.')
    return
  }

  // A Flow that was opened previously and has not completed: if the user
  // sends a chat message instead of completing the Flow, fall back to the
  // image-first chatbot path rather than leaving them stuck.
  if (context.step === 'flow_active') {
    logOnboarding('flow_fallback_chat', { phone: maskPhone(phone) })
    await sendPlanChoice(phone)
    return
  }

  if (context.step === 'choose_plan') {
    const chosen = await chooseRegistrationPlan(phone, text)
    if (!chosen) {
      await sendPlanChoice(phone)
    }
    return
  }

  if (context.step === 'choose_material' || context.step === 'awaiting_photo') {
    if (lower === 'skip' || lower === 'manual' || lower === 'enter manually' || lower === REGISTRATION_BUTTONS.skip) {
      logOnboarding('registration_skip_upload', { phone: maskPhone(phone) })
      await startManualCollection(phone, context)
      const first = (REQUIRED_FIELDS[0] as RequiredField)
      await sendWhatsAppMessage(
        phone,
        `📝 *Manual Registration (1/5)*\n\n${getPromptForField(first)}\n\n(Type *cancel* at any time to abort)`
      )
      return
    }

    if (lower === 'send picture' || lower === 'picture' || lower === 'photo' || lower === 'upload' || lower === REGISTRATION_BUTTONS.upload) {
      await updateConversationContext(phone, { step: 'awaiting_photo' })
      await sendWhatsAppMessage(
        phone,
        `📷 Send the picture now as a photo in this chat.\n\nIt can be a business card, flyer, banner, advert, menu or poster. Type *skip* instead to enter details manually.`
      )
      return
    }

    // Anything else before a choice: keep the upload option in front of them.
    await sendImageFirst(phone, context.approvedPlan || '1m')
    return
  }

  if (context.state === 'REGISTRATION_COLLECTING_FIELDS' || context.step === 'collecting_fields' || context.step === 'collecting_missing') {
    await handleFieldCollection(phone, text, context)
    return
  }

  if (context.step === 'review_extracted') {
    if (lower === 'proceed' || lower === 'yes' || lower === 'continue' || lower === 'ok' || lower === REGISTRATION_BUTTONS.proceed) {
      await showFinalReview(phone, context)
      return
    }
    if (lower === 'edit' || lower === REGISTRATION_BUTTONS.edit) {
      await sendWhatsAppMessage(
        phone,
        `✏️ To change a detail, reply with:\n\`edit Field: New Value\`\n\nExample: \`edit City: Bulawayo\`\n\nThen type *proceed*.`
      )
      return
    }
    if (lower.startsWith('edit ')) {
      const parts = text.slice(5).split(':')
      if (parts.length >= 2) {
        const fieldName = parts[0].trim().toLowerCase()
        const fieldValue = parts.slice(1).join(':').trim()
        const fields = context.fields || {}

        let key: RequiredField | 'website' | 'address' | 'area' | '' = ''
        if (fieldName.includes('name')) key = 'business_name'
        else if (fieldName.includes('category')) key = 'category'
        else if (fieldName.includes('city')) key = 'city'
        else if (fieldName.includes('phone') || fieldName.includes('whatsapp')) key = 'phone'
        else if (fieldName.includes('description') || fieldName.includes('offer')) key = 'description'
        else if (fieldName.includes('website')) key = 'website'
        else if (fieldName.includes('address')) key = 'address'
        else if (fieldName.includes('area')) key = 'area'

        if (key) {
          setFieldValue(fields, key, fieldValue)
          await updateConversationContext(phone, { fields })
          await sendWhatsAppMessage(phone, `✅ Updated *${FIELD_LABELS[key as RequiredField] || key}* to: ${fieldValue}\n\nType *proceed* when ready, or keep editing with \`edit Field: New Value\`.`)
          return
        }
      }
    }

    await sendWhatsAppMessage(
      phone,
      `Type *proceed* to review your listing, or edit a field with \`edit Field: New Value\`.`
    )
    return
  }

  // Final review stage
  if (context.step === 'final_review') {
    if (lower === 'publish' || lower === 'submit' || lower === 'yes') {
      await submitRegistration(phone, context)
      return
    }
    if (lower.startsWith('edit ')) {
      const parts = text.slice(5).split(':')
      if (parts.length >= 2) {
        const fieldName = parts[0].trim().toLowerCase()
        const fieldValue = parts.slice(1).join(':').trim()
        const listing = context.listing || {}

        let key = ''
        if (fieldName.includes('name')) key = 'name'
        else if (fieldName.includes('category')) key = 'categories'
        else if (fieldName.includes('city')) key = 'city'
        else if (fieldName.includes('phone')) key = 'phone'
        else if (fieldName.includes('description') || fieldName.includes('bio')) key = 'description'
        else if (fieldName.includes('website')) key = 'website'
        else if (fieldName.includes('address')) key = 'address'
        else if (fieldName.includes('price')) key = 'priceRange'

        if (key) {
          if (key === 'categories') listing[key] = [fieldValue]
          else listing[key] = fieldValue
          await updateConversationContext(phone, { listing })
          await showFinalReview(phone, { ...context, listing })
          return
        }
      }
    }

    await sendWhatsAppMessage(phone, `Type *publish* to submit your listing, or \`edit Field: Value\` to make changes.`)
  }
}

function setFieldValue(fields: any, key: string, value: string) {
  fields[key] = { value, confidence: 1.0, status: 'suggested' }
}

export async function handleRegistrationImage(phone: string, imageBytes: Uint8Array, caption: string) {
  // Capture the plan before overwriting state: the processing state below
  // replaces the whole context, and losing the plan here silently downgraded
  // an image-first trial registration to "paid".
  const previous = await getConversationState(phone)
  const approvedPlan = previous?.context?.approvedPlan as 'trial' | PlanType | undefined
  const trialRequested = previous?.context?.trialRequested === true || approvedPlan === 'trial'

  await setConversationState(phone, 'REGISTRATION_PROCESSING_IMAGE', {
    step: 'processing',
    approvedPlan,
    trialRequested,
  })
  logOnboarding('registration_image_received', { phone: maskPhone(phone) })
  await sendWhatsAppMessage(phone, `🔍 Reading your business material with AI... Please give us a moment.`)

  try {
    const outcome = await analyseBusinessMaterial([imageBytes], CATEGORY_NAMES)

    if (!outcome.ok) {
      await setConversationState(phone, 'REGISTRATION_AWAITING_IMAGE', {
        step: 'choose_material',
        approvedPlan,
        trialRequested,
      })
      logOnboarding('registration_image_failed', { phone: maskPhone(phone), reason: outcome.reason })
      await sendInteractiveButtons(
        phone,
        `⚠️ *We couldn't read the information in that image.*\n\n` +
          `You can try another picture or enter your details manually.`,
        [
          { id: REGISTRATION_BUTTONS.upload, title: '📷 Try another picture' },
          { id: REGISTRATION_BUTTONS.skip, title: 'Enter manually' },
        ]
      )
      return
    }

    const draft = outcome.draft
    const fields = draft.fields

    // Check mandatory fields using the same list the collector uses.
    const missing = REQUIRED_FIELDS.filter(key => !fields[key]?.value)

    // Format found vs missing summary
    const foundLines: string[] = []
    const missingLines: string[] = []

    for (const key of REQUIRED_FIELDS) {
      if (fields[key]?.value) foundLines.push(`✓ ${FIELD_LABELS[key]}: ${fields[key].value}`)
      else missingLines.push(`○ ${FIELD_LABELS[key]}`)
    }
    if (fields.website?.value) foundLines.push(`✓ Website: ${fields.website.value}`)
    if (fields.address?.value) foundLines.push(`✓ Address: ${fields.address.value}`)
    if (fields.area?.value) foundLines.push(`✓ Area: ${fields.area.value}`)

    let msg = `🔍 *We've read your business information!*\n\nHere is what we found:\n\n` + foundLines.join('\n')

    if (missingLines.length > 0) {
      msg += `\n\nWe couldn't identify:\n\n` + missingLines.join('\n')
    }

    if (missing.length > 0) {
      await setConversationState(phone, 'REGISTRATION_COLLECTING_FIELDS', {
        step: 'collecting_missing',
        approvedPlan,
        trialRequested,
        draft,
        fields,
        missing,
        currentMissingIndex: 0,
      })
      logOnboarding('registration_image_extracted', { phone: maskPhone(phone), missing: missing.length })
      msg += `\n\nLet's complete the missing details.\n\n` + getPromptForField(missing[0])
      await sendWhatsAppMessage(phone, msg)
      return
    }

    await setConversationState(phone, 'REGISTRATION_REVIEW_EXTRACTED', {
      step: 'review_extracted',
      approvedPlan,
      trialRequested,
      draft,
      fields,
      missing: [],
    })
    logOnboarding('registration_image_extracted', { phone: maskPhone(phone), missing: 0 })

    msg += `\n\nAll required information found. Please review it above and confirm.`
    await sendInteractiveButtons(phone, msg, [
      { id: REGISTRATION_BUTTONS.proceed, title: '✅ Looks good' },
      { id: REGISTRATION_BUTTONS.edit, title: '✏️ Edit details' },
    ])
  } catch (err) {
    console.error('[bot-registration] Image analysis error:', err)
    await setConversationState(phone, 'REGISTRATION_AWAITING_IMAGE', {
      step: 'choose_material',
      approvedPlan,
      trialRequested,
    })
    await sendInteractiveButtons(
      phone,
      `⚠️ An error occurred while processing your image. Please try again or enter details manually.`,
      [
        { id: REGISTRATION_BUTTONS.upload, title: '📷 Try another picture' },
        { id: REGISTRATION_BUTTONS.skip, title: 'Enter manually' },
      ]
    )
  }
}

function getPromptForField(field: string): string {
  switch (field) {
    case 'business_name':
      return `What is your business name?`
    case 'category':
      return `Which category best describes your business? (e.g. Food & Restaurant, Hardware, Clothing & Fashion)`
    case 'phone':
      return `Which phone number should customers use on WhatsApp?`
    case 'city':
      return `📍 Which city or town is your business in?`
    case 'description':
      return `In a few words, what products or services does your business offer?`
    default:
      return `Please provide: ${field}`
  }
}

async function handleFieldCollection(phone: string, text: string, context: any) {
  const fields = context.fields || {}
  const missing: string[] = context.missing || []
  const index = context.currentMissingIndex || 0

  const currentFieldKey = missing[index]
  if (currentFieldKey) {
    const answer = currentFieldKey === 'category' ? (matchCategory(text) || text) : text
    setFieldValue(fields, currentFieldKey, answer)
  }

  const nextIndex = index + 1
  if (nextIndex < missing.length) {
    await setConversationState(phone, 'REGISTRATION_COLLECTING_FIELDS', {
      ...context,
      fields,
      missing,
      currentMissingIndex: nextIndex,
    })
    await sendWhatsAppMessage(
      phone,
      `✅ Saved.\n\n${getPromptForField(missing[nextIndex])}\n\n(${nextIndex + 1}/${missing.length})`
    )
    return
  }

  // All required fields collected — move to final review.
  await setConversationState(phone, 'REGISTRATION_FINAL_REVIEW', {
    ...context,
    fields,
    missing,
    currentMissingIndex: missing.length,
    step: 'final_review',
  })
  await showFinalReview(phone, { ...context, fields })
}

async function showFinalReview(phone: string, context: any) {
  const f = context.fields || {}

  const name = f.business_name?.value || 'Not set'
  const category = f.category?.value || 'Other'
  const city = f.city?.value || 'Harare'
  const phoneVal = f.phone?.value || phone
  const area = f.area?.value || ''
  const description = f.description?.value || ''
  const website = f.website?.value || ''
  const address = f.address?.value || ''

  const listing = {
    name,
    categories: [category],
    city,
    phone: phoneVal,
    area,
    description,
    website,
    address,
    notify: false,
  }

  await setConversationState(phone, 'REGISTRATION_FINAL_REVIEW', {
    ...context,
    step: 'final_review',
    fields: f,
    listing,
  })

  await sendWhatsAppMessage(
    phone,
    `🏪 *Your listing — Ready to submit*\n\n` +
      `✓ Name: ${name}\n` +
      `✓ Category: ${category}\n` +
      `✓ City: ${city}\n` +
      `✓ Phone: ${phoneVal}\n` +
      `${area ? `✓ Area: ${area}\n` : ''}` +
      `${description ? `✓ Description: ${description}\n` : ''}` +
      `${website ? `✓ Website: ${website}\n` : ''}` +
      `${address ? `✓ Address: ${address}\n` : ''}` +
      `\nActivation: ${context.approvedPlan === 'trial' ? TRIAL_PLAN_LABEL + ' (starts when an admin approves)' : `Paid — USD ${formatUsd(PLAN_CONFIG['1m'].price)}/month`}\n\n` +
      `To edit a field, reply with: \`edit Field: New Value\`\n` +
      `Example: \`edit City: Bulawayo\`\n\n` +
      `Tap or type *publish* when ready.`
  )
}

async function submitRegistration(phone: string, context: any) {
  if (context.submitting) {
    logOnboarding('registration_duplicate_submit_blocked', { phone: maskPhone(phone) })
    await sendWhatsAppMessage(phone, `⏳ Your listing is already being submitted. Please wait a moment.`)
    return
  }

  const listingData = context.listing || {}
  const name = (listingData.name || '').trim()
  const phoneValue = listingData.phone || phone

  await setConversationState(phone, 'REGISTRATION_PROCESSING_IMAGE', {
    ...context,
    step: 'submitting',
    submitting: true,
  })

  // One listing per business identity: a second pending/active listing with
  // the same name and phone is not created.
  if (name) {
    const supabase = getSupabase()
    const { data: duplicate } = await supabase
      .from('businesses')
      .select('id')
      .ilike('name', name)
      .eq('phone', phoneValue)
      .in('payment_status', ['pending', 'active'])
      .maybeSingle()

    if (duplicate) {
      logOnboarding('registration_duplicate_listing_blocked', { phone: maskPhone(phone) })
      await clearConversationState(phone)
      await sendWhatsAppMessage(
        phone,
        `ℹ️ *A listing with these details already exists.*\n\n` +
          `Your existing listing is pending review or already live. ` +
          `Edit it from your portal, or contact support if you need another branch listed.`
      )
      return
    }
  }

  const result = await createListing({
    name: listingData.name,
    categories: listingData.categories || ['Other'],
    city: listingData.city || 'Harare',
    phone: listingData.phone || phone,
    areas: listingData.area ? [listingData.area] : [],
    description: listingData.description || '',
    website: listingData.website || '',
    address: listingData.address || '',
  })

  if ('error' in result) {
    await setConversationState(phone, 'REGISTRATION_FINAL_REVIEW', { ...context, step: 'final_review', submitting: false })
    await sendWhatsAppMessage(phone, `❌ Error creating listing: ${result.error}\n\nPlease type *publish* to try again or *cancel*.`)
    return
  }

  // Record a trial *request* only. The 90 days start later, when an admin
  // approves/publishes the listing — never now.
  let trialRequested = false
  if (context.approvedPlan === 'trial') {
    const request = await requestTrial(result.id)
    trialRequested = request.ok
    if (!request.ok) {
      logOnboarding('trial_request_failed', { phone: maskPhone(phone), error: request.error })
    }
  }

  // The registration session ends here; the listing is now in review. Keeping
  // AWAITING_ADMIN_REVIEW (rather than deleting state) also prevents a second
  // registration session from being started by a stray message.
  await setConversationState(phone, 'AWAITING_ADMIN_REVIEW', {
    businessId: result.id,
    businessName: result.name,
    businessSlug: result.slug,
    approvedPlan: context.approvedPlan || '1m',
    trialRequested,
    city: listingData.city || '',
  })
  logOnboarding('registration_submitted', {
    phone: maskPhone(phone),
    businessId: result.businessId,
    plan: context.approvedPlan || '1m',
    trialRequested,
  })

  const activationLine = trialRequested
    ? `\n\n🆓 *${TRIAL_PLAN_LABEL} requested.* It starts only after our team approves and publishes your listing, and runs for 90 days with no payment.`
    : `\n\n💳 Activation: USD ${formatUsd(PLAN_CONFIG['1m'].price)}/month after approval.`

  await sendWhatsAppMessage(
    phone,
    `🎉 *Listing Submitted Successfully!*\n\n` +
      `Your business *${result.name}* has been submitted for review.\n` +
      `Business ID: ${result.businessId}\n` +
      `Username: @${result.username}\n\n` +
      `Our team will review your listing within 24 hours.` +
      activationLine
  )
}

/** Exported for the webhook's Flow-completion path and tests. */
export function registrationPlanForTrial(status?: TrialStatus | null): boolean {
  return status === 'requested'
}