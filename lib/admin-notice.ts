/**
 * Admin WhatsApp notices with up to three quick-reply buttons.
 *
 * WhatsApp's button message carries at most three reply buttons; everything
 * else stays a typed command. Button ids are exactly the command we would have
 * typed (`verify <name> 30`, `pending`, `requests`), so a tap runs the same
 * handler as the text - no second code path to keep in sync.
 */

import { sendInteractiveButtons, sendWhatsAppMessage, type InteractiveButton } from './whatsapp.js'
import { SITE_URL } from './site-url.js'

export type AdminNoticeButton = InteractiveButton

/** The three things an admin does with a freshly submitted listing. */
export function pendingVerificationButtons(businessName: string): AdminNoticeButton[] {
  const name = businessName.trim()
  return [
    name
      ? { id: `verify ${name} 30`, title: '✅ Verify 30 days' }
      : { id: 'pending', title: '✅ Verify 30 days' },
    { id: 'pending', title: '🕵️ Pending list' },
    { id: 'requests', title: '🗂 Requests' },
  ]
}

/** Same actions for a location/category request raised by a submission. */
export function reviewRequestButtons(businessName: string): AdminNoticeButton[] {
  return [
    { id: 'requests', title: '🗂 Requests' },
    { id: 'pending', title: '🕵️ Pending list' },
    ...(businessName.trim()
      ? [{ id: `verify ${businessName.trim()} 30`, title: '✅ Verify 30d' }]
      : []),
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
    'Tap a button, or reply *pending* then *verify 1*.',
    `Approve: ${SITE_URL}/admin`,
  ].join('\n')
}
