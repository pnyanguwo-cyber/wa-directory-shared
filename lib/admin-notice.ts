/**
 * Admin WhatsApp notices with up to three quick-reply buttons.
 *
 * WhatsApp's button message carries at most three reply buttons; everything
 * else stays a typed command. Button ids are exactly the command we would have
 * typed (`verify <name>`, `trial <name>`, `pending`), so a tap runs the same
 * handler as the text - no second code path to keep in sync.
 */

import { sendInteractiveButtons, sendWhatsAppMessage, type InteractiveButton } from './whatsapp.js'
import { SITE_URL } from './site-url.js'

export type AdminNoticeButton = InteractiveButton

/**
 * The three things an admin does with a freshly submitted listing.
 *
 * `verify <name>` carries no day count on purpose: the bot then checks whether
 * the owner asked for the 90-day free trial and starts that trial, otherwise
 * it grants the usual 30 days. Typing `verify <name> 30` would force the
 * 30-day grant and leave a trial request pending.
 */
export function pendingVerificationButtons(businessName: string): AdminNoticeButton[] {
  const name = businessName.trim()
  return [
    name
      ? { id: `verify ${name}`, title: '✅ Approve' }
      : { id: 'pending', title: '✅ Approve' },
    name
      ? { id: `trial ${name}`, title: '🆓 90-day trial' }
      : { id: 'pending', title: '🆓 90-day trial' },
    { id: 'pending', title: '🕵️ Pending list' },
  ]
}

/**
 * Same actions for a location/category request raised by a submission.
 *
 * When the submission asked for a category, the middle button is "Connect to":
 * many requests are just another name for a category we already have, and
 * approving them as new ones splits the directory. Three buttons is the
 * WhatsApp maximum, so the pending list gives way to the connect action when
 * it applies.
 */
export function reviewRequestButtons(
  businessName: string,
  hasCategoryRequest = false
): AdminNoticeButton[] {
  const name = businessName.trim()
  const tail = name ? [{ id: `verify ${name}`, title: '✅ Approve' }] : []
  if (hasCategoryRequest) {
    return [
      { id: 'requests', title: '🗂 Requests' },
      { id: 'connect req', title: '🔗 Connect to' },
      ...tail,
    ]
  }
  return [
    { id: 'requests', title: '🗂 Requests' },
    { id: 'pending', title: '🕵️ Pending list' },
    ...tail,
  ]
}

/**
 * Send an admin notice as buttons, falling back to plain text (with the
 * commands spelled out) when Meta rejects the interactive payload.
 */
export async function sendAdminNotice(
  phone: string | undefined,
  body: string,
  buttons: AdminNoticeButton[] = []
): Promise<void> {
  if (!phone) return
  if (!buttons.length) {
    await sendWhatsAppMessage(phone, body)
    return
  }
  try {
    await sendInteractiveButtons(phone, body, buttons)
  } catch (err) {
    console.error('[admin-notice] buttons failed, sending text:', err)
    await sendWhatsAppMessage(phone, body)
  }
}

/** Body for a new submission, with the dashboard link kept in the text. */
export function submissionNoticeBody(fields: {
  title: string
  name: string
  code: string
  category: string
  location: string
  phone: string
  extra?: string[]
}): string {
  return [
    fields.title,
    '',
    `Name: ${fields.name}`,
    `ID: ${fields.code}`,
    `Category: ${fields.category || '—'}`,
    `Location: ${fields.location || 'Zimbabwe (whole country)'}`,
    `Phone: ${fields.phone}`,
    ...(fields.extra || []),
    '',
    '✅ Approve = 90-day trial if they asked for one, otherwise 30 days.',
    '🆓 90-day trial = start the full trial now.',
    'Or reply *pending* then *verify 1* / *verify 1 30*.',
    `Approve: ${SITE_URL}/admin`,
  ].join('\n')
}
