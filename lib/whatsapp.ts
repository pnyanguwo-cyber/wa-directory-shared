const WHATSAPP_API = 'https://graph.facebook.com/v18.0'

async function postToWhatsApp(phoneNumberId: string, accessToken: string, payload: unknown): Promise<boolean> {
  try {
    // Test mode: log instead of sending so message-flow changes can be
    // validated end-to-end without delivering anything to real users.
    if (process.env.WHATSAPP_DRY_RUN === '1') {
      const p = payload as { to?: string; text?: { body?: string } }
      console.log(`[whatsapp][dry-run] to=${p.to ?? '(n/a)'}\n${p.text?.body ?? JSON.stringify(payload)}`)
      return true
    }
    const res = await fetch(`${WHATSAPP_API}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[whatsapp] Send failed:', err)
      return false
    }
    return true
  } catch (err) {
    console.error('[whatsapp] Network error:', err)
    return false
  }
}

export async function sendWhatsAppMessage(to: string, message: string, replyTo?: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    console.warn('[whatsapp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN')
    return
  }

  await postToWhatsApp(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: message },
    ...(replyTo ? { context: { message_id: replyTo } } : {}),
  })
}

// Mark an inbound message as read (blue ticks), optionally lighting the
// composing indicator for ~30s or until the next outgoing message. Pure
// best-effort: failures are swallowed — never let cosmetics break a reply.
export async function markRead(messageId: string, typing = false) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!messageId || !phoneNumberId || !accessToken) return

  if (process.env.WHATSAPP_DRY_RUN === '1') {
    console.log(`[whatsapp][dry-run][read${typing ? '+typing' : ''}] id=${messageId}`)
    return
  }

  try {
    const res = await fetch(`${WHATSAPP_API}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        ...(typing ? { typing_indicator: { type: 'text' } } : {}),
      }),
    })
    if (!res.ok) return
  } catch {
    // Cosmetic only.
  }
}

// Native "share your location" prompt: one interactive message with the
// phone's location button. Falls back to a plain-text ask when the
// business account doesn't support the template type.
export async function sendLocationRequest(to: string, body: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!phoneNumberId || !accessToken) {
    console.warn('[whatsapp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN')
    return
  }

  const cleanBody = clip(body, 1024)
  if (process.env.WHATSAPP_DRY_RUN === '1') {
    console.log(`[whatsapp][dry-run][location_request] to=${to}\n${cleanBody}`)
    return
  }

  const ok = await postToWhatsApp(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'location_request_message',
      body: { text: cleanBody, type: 'text' },
      action: { name: 'send_location' },
    },
  })

  if (!ok) {
    await postToWhatsApp(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: `${cleanBody}\n\n(Please send your location, or type your town - e.g. *harare*.)` },
    })
  }
}

// vCard contact-card handoff (WhatsApp native "contacts" message). Used at
// need close so buyer and winning supplier can save each other with one tap.
export async function sendContactCard(to: string, name: string, phone: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!phoneNumberId || !accessToken || !to) return

  const cleanPhone = `+${(phone || '').replace(/\D/g, '')}`
  if (!cleanPhone || cleanPhone === '+') return

  if (process.env.WHATSAPP_DRY_RUN === '1') {
    console.log(`[whatsapp][dry-run][contact] to=${to} ${name} ${cleanPhone}`)
    return
  }

  try {
    await postToWhatsApp(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to,
      type: 'contacts',
      contacts: [
        {
          name: { formatted_name: name || 'Contact', first_name: (name || 'Contact').split(' ')[0] },
          phones: [{ phone: cleanPhone, type: 'CELL' }],
        },
      ],
    })
  } catch {
    // best-effort handoff
  }
}

// React to one of the user's own messages (best-effort cosmetics).
export async function sendReaction(to: string, messageId: string, emoji: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!messageId || !phoneNumberId || !accessToken) return

  if (process.env.WHATSAPP_DRY_RUN === '1') {
    console.log(`[whatsapp][dry-run][reaction] to=${to} ${emoji} on ${messageId}`)
    return
  }

  await postToWhatsApp(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to,
    type: 'reaction',
    reaction: { message_id: messageId, emoji },
  })
}

// ── Interactive (WhatsApp native) messages ────────────────────────────────
// Cloud API limits: body 1024, list button label 20, up to 10 rows over all
// sections (row title 24, description 72), up to 3 reply buttons (title 20,
// id 256). Helpers clip every field so oversized data can still go out
// instead of erroring the whole send.

function clip(text: string, max: number): string {
  const t = (text || '').trim()
  return t.length <= max ? t : t.slice(0, max - 1) + '…'
}

export interface InteractiveRow {
  id: string
  title: string
  description?: string
}

export interface InteractiveButton {
  id: string
  title: string
}

async function postInteractive(
  to: string,
  kind: 'list' | 'button',
  interactive: Record<string, unknown>,
  bodyForLog: string,
  summaryForLog: string,
  replyTo?: string
): Promise<boolean> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    console.warn('[whatsapp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN')
    return false
  }

  if (process.env.WHATSAPP_DRY_RUN === '1') {
    console.log(
      `[whatsapp][dry-run][${kind}] to=${to} (${summaryForLog})\n${bodyForLog}`
    )
    return true
  }

  return postToWhatsApp(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: { type: kind, ...interactive },
    ...(replyTo ? { context: { message_id: replyTo } } : {}),
  })
}

/**
 * CTA-URL message: body text with one native button that opens a link.
 * Some WhatsApp Business Accounts don't support cta_url yet (recent rollout),
 * so a failure degrades to plain text carrying the same (short) link.
 */
export async function sendCtaUrl(to: string, body: string, displayText: string, url: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    console.warn('[whatsapp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN')
    return
  }

  const cleanBody = clip(body, 1024)
  if (process.env.WHATSAPP_DRY_RUN === '1') {
    console.log(
      `[whatsapp][dry-run][cta_url] to=${to} [${clip(displayText, 25)}] → ${url}\n${cleanBody}`
    )
    return
  }

  const ok = await postToWhatsApp(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: cleanBody },
      action: {
        name: 'cta_url',
        parameters: { display_text: clip(displayText, 25), url },
      },
    },
  })

  if (!ok) {
    await postToWhatsApp(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: `${cleanBody}\n\n💬 ${url}` },
    })
  }
}

/** List message: a body plus a button that opens tappable rows. */
export async function sendInteractiveList(
  to: string,
  body: string,
  rows: InteractiveRow[],
  buttonLabel = 'Choose a business',
  replyTo?: string
) {
  const safeRows = rows.slice(0, 10).map(r => ({
    id: clip(r.id, 200),
    title: clip(r.title, 24),
    description: r.description ? clip(r.description, 72) : undefined,
  }))

  await postInteractive(
    to,
    'list',
    {
      body: { text: clip(body, 1024) },
      action: {
        button: clip(buttonLabel, 20),
        sections: [{ title: clip('Options', 24) as string, rows: safeRows }],
      },
    },
    clip(body, 1024),
    `${safeRows.length} rows: ${safeRows.map(r => `${r.id}: ${r.title}${r.description ? ` (${r.description})` : ''}`).join(' | ')}`,
    replyTo
  )
}

/** Button message: a body with up to three quick-reply buttons. */
export async function sendInteractiveButtons(
  to: string,
  body: string,
  buttons: InteractiveButton[],
  replyTo?: string
) {
  const safeButtons = buttons.slice(0, 3).map(b => ({
    type: 'reply' as const,
    reply: { id: clip(b.id, 256), title: clip(b.title, 20) },
  }))

  if (safeButtons.length === 0) {
    await sendWhatsAppMessage(to, clip(body, 4096))
    return
  }

  await postInteractive(
    to,
    'button',
    {
      body: { text: clip(body, 1024) },
      action: { buttons: safeButtons },
    },
    clip(body, 1024),
    safeButtons.map(b => b.reply.id).join(','),
    replyTo
  )
}

/**
 * Product card: image + body + quick-reply buttons in ONE interactive
 * message, so the button always travels with the picture. Degrades to the
 * image/caption (then buttons) path when the interactive post fails.
 */
export async function sendInteractiveImageCard(
  to: string,
  body: string,
  imageUrl: string | null,
  buttons: InteractiveButton[]
) {
  const safeButtons = buttons.slice(0, 3).map(b => ({
    type: 'reply' as const,
    reply: { id: clip(b.id, 256), title: clip(b.title, 20) },
  }))

  if (safeButtons.length === 0) {
    await sendImageWithFallback(to, imageUrl || '', clip(body, 1024))
    return
  }

  const cleanBody = clip(body, 1024)
  const card = {
    type: 'button' as const,
    ...(imageUrl ? { header: { type: 'image' as const, image: { link: imageUrl } } } : {}),
    body: { text: cleanBody },
    action: { buttons: safeButtons },
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    console.warn('[whatsapp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN')
    return
  }

  if (process.env.WHATSAPP_DRY_RUN === '1') {
    console.log(
      `[whatsapp][dry-run][image-card] to=${to} img=${imageUrl ? 'yes' : 'no'} (${safeButtons.map(b => b.reply.id).join(',')})\n${cleanBody}`
    )
    return
  }

  const ok = await postToWhatsApp(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: card,
  })

  if (!ok) {
    if (imageUrl) {
      await sendImageWithFallback(to, imageUrl, cleanBody)
      await sendInteractiveButtons(to, 'Options', buttons)
    } else {
      await sendInteractiveButtons(to, cleanBody, buttons)
    }
  }
}

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  params: string[] = [],
  language = 'en'
) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    console.warn('[whatsapp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN')
    return
  }

  await postToWhatsApp(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components:
        params.length > 0
          ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: p })) }]
          : undefined,
    },
  })
}

/** Document message (CSV exports etc.): upload the file to Meta's media API,
 * then reference it by media id. Dry-run logs instead of uploading. */
export async function sendWhatsAppDocument(
  to: string,
  filename: string,
  mime: string,
  content: string | Buffer
): Promise<boolean> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    console.warn('[whatsapp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN')
    return false
  }

  if (process.env.WHATSAPP_DRY_RUN === '1') {
    console.log(`[whatsapp][dry-run][document] to=${to} ${filename} (${mime}, ${content.length} bytes)`)
    return true
  }

  try {
    const form = new FormData()
    const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : content
    form.append('file', new Blob([new Uint8Array(bytes)], { type: mime }), filename)
    form.append('messaging_product', 'whatsapp')
    const up = await fetch(`${WHATSAPP_API}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    })
    if (!up.ok) {
      console.error('[whatsapp] Media upload failed:', await up.text())
      return false
    }
    const { id } = (await up.json()) as { id: string }
    if (!id) {
      console.error('[whatsapp] Media upload returned no id')
      return false
    }
    return await postToWhatsApp(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { id, filename },
    })
  } catch (err) {
    console.error('[whatsapp] Document send error:', err)
    return false
  }
}

/**
 * Send an image message via WhatsApp Cloud API.
 * Uses the image URL directly (no upload needed) — accepts public URLs.
 * Caption supports up to 1024 characters.
 */
export async function sendWhatsAppImage(
  to: string,
  imageUrl: string,
  caption: string,
  replyTo?: string
): Promise<boolean> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  if (!phoneNumberId || !accessToken) {
    console.warn('[whatsapp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN')
    return false
  }

  if (process.env.WHATSAPP_DRY_RUN === '1') {
    console.log(`[whatsapp][dry-run][image] to=${to} ${imageUrl}\n${caption}`)
    return true
  }

  return postToWhatsApp(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: { link: imageUrl, caption: clip(caption, 1024) },
    ...(replyTo ? { context: { message_id: replyTo } } : {}),
  })
}

/**
 * Sends an image message, falling back to a plain text message when the
 * image send fails (so the customer always receives content).
 * Returns true when the image was actually sent.
 */
export async function sendImageWithFallback(
  to: string,
  imageUrl: string,
  caption: string,
  replyTo?: string
): Promise<boolean> {
  let ok = false
  if (imageUrl) ok = await sendWhatsAppImage(to, imageUrl, caption, replyTo)
  if (ok) return true
  await sendWhatsAppMessage(to, caption)
  return false
}