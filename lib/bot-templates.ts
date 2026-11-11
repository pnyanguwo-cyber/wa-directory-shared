import { SITE_URL } from './site-url.js'
import type { InteractiveRow } from './whatsapp.js'

// The literal phrase that ties a customer chat to our attribution message:
// written by /go/[id] when a customer opens a business chat, and matched by
// the bot's transcript + rating flows. Both sides must import this constant
// so a copy edit can never silently break transcript logging or prompts.
export const CHAT_OPEN_MARKER = 'opened your chat'

/**
 * WhatsApp inline-code price: `$1.50` renders monospace in the client.
 */
export function monoUSD(price: number): string {
  const s = price.toFixed(2)
  return `\`$${s.endsWith('.00') ? s.slice(0, -3) : s}\``
}

/**
 * Wraps a free-form database price string ("$5–$40", "From $10") in the same
 * monospace price treatment. Empty input renders as nothing.
 */
export function monoPrice(raw: string | null | undefined): string {
  const s = (raw || '').trim().replace(/`/g, '')
  return s ? `\`${s}\`` : ''
}

export interface ResultCard {
  id: string
  name: string
  city: string | null
  area: string | null
  km?: number | null
  // Exact product match the customer searched for (may be unpriced).
  // id + image_url ride along so the bot can offer that item's
  // single photo without opening the catalog (the 📸 quick action).
  item: { name: string; price: number | null; id?: string; image_url?: string | null } | null
  // Business-level price range, only shown when there is no exact product.
  priceRange: string | null
  // Verification signals for trust badges
  verified?: boolean
  paymentStatus?: string
  rating?: number
  reviewCount?: number
  responseTimeMinutes?: number
  ordersFulfilled?: number
  escrowEligible?: boolean
}

export function displayLocation(city: string | null, area?: string | null): string {
  if (area && city) return `Area of service: ${area}, ${city}`
  if (area) return `Area of service: ${area}`
  return city || 'Zimbabwe'
}

function searchCardPriceLine(card: ResultCard): string | null {
  if (card.item) {
    return card.item.price != null
      ? `${card.item.name}: ${monoUSD(card.item.price)}`
      : `${card.item.name}: Price not listed`
  }
  const range = monoPrice(card.priceRange)
  return range ? `💰 ${range}` : null
}

function searchCardLines(card: ResultCard, i: number): string[] {
  const badges = buildBadges(card)
  const lines = [`${i + 1}. *${card.name}*${badges}`]
  lines.push(`📍 ${displayLocation(card.city, card.area)}${card.km != null ? ` (~${Math.round(card.km)} km)` : ''}`)
  const priceLine = searchCardPriceLine(card)
  if (priceLine) lines.push(priceLine)
  return lines
}

function capFirst(term: string): string {
  return term.length > 0 ? term[0].toUpperCase() + term.slice(1) : term
}

/**
 * Search results message. `cityLabel` null means the search was nationwide.
 */
export function renderResultsMessage(
  termDisplay: string,
  cityLabel: string | null,
  cards: ResultCard[]
): string {
  const header = cityLabel
    ? `*${capFirst(termDisplay)} near ${cityLabel}*`
    : `*${capFirst(termDisplay)} (countrywide)*`
  const reply = cards.length === 1 ? '*1*' : `*1* to *${cards.length}*`
  return [
    header,
    '',
    `I found ${cards.length} matching listing${cards.length === 1 ? '' : 's'} in the current directory.`,
    '',
    cards.map((c, i) => searchCardLines(c, i)).join('\n\n'),
    '',
    `Reply with ${reply} to view business details.`,
    'You can also change your location or start a new search.',
  ].join('\n')
}

/**
 * Nearby-town results message (the requested town had no verified matches).
 */
export function renderNearbyMessage(
  termDisplay: string,
  city: string,
  cards: ResultCard[]
): string {
  const reply = cards.length === 1 ? '*1*' : `*1* to *${cards.length}*`
  return [
    `No ${termDisplay} in *${city}*. Nearest:`,
    '',
    cards.map((c, i) => searchCardLines(c, i)).join('\n\n'),
    '',
    `Reply with ${reply} to view business details, or try *whole country*.`,
  ].join('\n')
}

export interface DetailData {
  name: string
  slug: string | null
  city: string | null
  area: string | null
  rating: number
  reviewCount: number | null
  /** Up to 3 active items for this business. */
  items: { name: string; price: number | null }[]
  phone: string | null
  /** 'whatsapp' | 'voice' | null */
  phoneType: string | null
  /** Social links (personal contacts carry these). */
  socials?: string[]
  // Verification signals
  verified?: boolean
  paymentStatus?: string
  responseTimeMinutes?: number
  ordersFulfilled?: number
  escrowEligible?: boolean
  website?: string | null
  /** Business has a generated mini-site (gated to active paid plans). */
  generateSite?: boolean
}

/** Readable phone display: +263 772 234 002. */
export function formatPhone(raw: string | null | undefined): string {
  const digits = (raw || '').replace(/[^0-9]/g, '')
  if (!digits) return ''
  const cc = digits.slice(0, 3)
  const rest = digits.slice(3).replace(/(\d{3})(?=\d)/g, '$1 ')
  return `+${cc} ${rest}`
}

/** The /go redirect: logs attribution + transcript marker, then opens the
 * business WhatsApp chat with the prefill text. */
export function chatCtaUrl(businessId: string, customerPhone: string): string {
  const base = `${SITE_URL}/go/${businessId}`
  const params = new URLSearchParams({ f: customerPhone || '', via: 'WhatsApp bot' })
  return `${base}?${params.toString()}`
}

/** Body for the native chat button that follows the detail card. */
export function renderChatPrompt(name: string): string {
  return `Tap below to start a WhatsApp chat with ${name}.`
}

/**
 * Business details card. Omits fields that are not available; contact lines
 * adapt to the listing (voice-only numbers get a call line, missing numbers
 * fall back to the listing page).
 */
export function renderDetailCard(b: DetailData): string {
  const badges: string[] = []
  if (b.verified) badges.push('✅ Verified')
  if (b.paymentStatus === 'active') badges.push('💎 Active subscriber')
  if (b.rating > 0 && b.reviewCount && b.reviewCount > 0) {
    badges.push(`⭐ ${b.rating.toFixed(1)} (${b.reviewCount} review${b.reviewCount === 1 ? '' : 's'})`)
  }
  if (b.responseTimeMinutes && b.responseTimeMinutes <= 15) badges.push('⚡ Replies in <15 min')
  if (b.ordersFulfilled && b.ordersFulfilled >= 10) badges.push(`📦 ${b.ordersFulfilled}+ orders fulfilled`)
  if (b.escrowEligible) badges.push('🛡️ WA Directory Protected')

  const lines = [b.name ? `*${b.name}*` : 'Business details']
  lines.push(`📍 ${displayLocation(b.city, b.area)}`)
  if (badges.length) lines.push(badges.join(' · '))
  lines.push('')

  if (b.items.length > 0) {
    lines.push('')
    lines.push('*Products and prices*')
    for (let i = 0; i < b.items.length; i++) {
      const it = b.items[i]
      lines.push(`${i + 1}. ${it.name}${it.price != null ? `: ${monoUSD(it.price)}` : ': Price not listed'}`)
    }
    if (b.items.every(it => it.price == null)) {
      // All items unpriced, keep the note honest without inventing prices
      lines.push('(prices not listed, chat for a quote)')
    }
    // Order-builder pointer: the shelf accepts a typed one-liner order.
    lines.push('🧺 Order from this shop: reply *order 2 bread 1 cake*.')
  }

  const digits = (b.phone || '').replace(/[^0-9]/g, '')
  const isVoice = b.phoneType === 'voice'
  const hasDigits = digits.length > 0
  lines.push('')
  lines.push('*Contact*')
  if (hasDigits) {
    lines.push(isVoice ? `📞 ${formatPhone(digits)} (voice line, no WhatsApp)` : `📞 ${formatPhone(digits)}`)
  } else {
    lines.push(`🔗 ${listingUrl(b)}`)
  }

  const website = (b.website || '').trim()
  if (website) {
    const siteUrl = /^(https?:)?\/\//i.test(website) ? website : `https://${website}`
    lines.push(`🌐 ${siteUrl}`)
  }

  const socials = (b.socials || []).filter(Boolean).slice(0, 3)
  if (socials.length > 0) {
    lines.push('', '*Socials*')
    for (const s of socials) lines.push(`🔗 ${s}`)
  }

  const shopLine =
    b.generateSite && b.paymentStatus === 'active' && b.slug
      ? ['🪄 Online shop', `${SITE_URL}/site/${b.slug}`]
      : []
  return [
    ...lines,
    '',
    '🔗 View full listing',
    listingUrl(b),
    ...shopLine,
    '',
    'Reply *back* to go back, or send a new search.',
  ].join('\n')
}

function listingUrl(b: { slug: string | null }): string {
  return `${SITE_URL}/business/${b.slug || 'listing'}`
}

// ── S18.2 typed customer orders ───────────────────────────────────────────

export interface VerifyGroup {
  businessName: string
  city?: string
  lines: { name: string; qty: number; price: number | null }[]
}

/** Verify screen of the typed order: everything matched, grouped per shop,
 * with a grand total when every line carries a price. */
export function renderOrderVerify(
  groups: VerifyGroup[],
  footer = 'Tap ✅ to send now, or ✎ to re-type it.'
): string {
  const out: string[] = []
  let total = 0
  let priced = 0

  for (const g of groups) {
    out.push(`🏪 *${g.businessName}*${g.city ? `, ${g.city}` : ''}`)
    for (const l of g.lines) {
      out.push(`· ${l.qty} × ${l.name}${l.price != null ? ` ${monoUSD(l.price)}` : ''}`)
      if (l.price != null) {
        total += l.price * l.qty
        priced++
      }
    }
    out.push('')
  }
  out.pop()

  const bits = [
    '🧺 *Check your order* 🔎',
    '',
    ...out,
  ]
  if (priced && priced === groups.reduce((s, g) => s + g.lines.length, 0)) {
    bits.push('', `*Total: ${monoUSD(total).replace(/`/g, '')}*`)
  }
  bits.push('', footer)
  return bits.join('\n')
}

/** Post-commit receipt: what went out, where, and which shops are quiet. */
export function renderOrderSent(
  rows: { businessName: string; status: string; token: string; dmOk: boolean | null }[]
): string {
  const out: string[] = []
  for (const r of rows) {
    const mark =
      r.dmOk === true ? '💬' : r.dmOk === false ? '⏳' : '⚠️'
    out.push(`${mark} *${r.businessName}*, wa.directory/go/o/${r.token}`)
  }
  return [
    `📤 *Order off! ${rows.length} shop${rows.length === 1 ? '' : 's'} queued.*`,
    '',
    ...out,
    '',
    '📩 Now let them know, open each link and press send.',
    '🔔 I ping you here when each shop confirms.',
  ].join('\n')
}

/** Buyer-side "my orders" tracker. */
export function renderMyOrders(
  rows: { biz_name: string; status: string; token: string }[]
): string {
  const label: Record<string, string> = {
    open: '⏳ waiting for you to send',
    sent: '📩 sent, waiting to confirm',
    claimed: '✅ shop confirmed!',
    closed: '⌛ expired (re-order anytime)',
  }
  return [
    '🧾 *Your orders*',
    '',
    ...rows.map(r => `· *${r.biz_name}*, ${label[r.status] || r.status}, wa.directory/go/o/${r.token}`),
  ].join('\n')
}

/** Empty results / no supply message. */
// ── Need / matchmaking flow (S16) ─────────────────────────────────────────

export interface NeedDraft {
  item: string
  qty: string
  budget: string
  city: string
}

export function renderNeedIntro(): string {
  return [
    '🛒 *Post a need, we find suppliers for you.*',
    '',
    'Send it in one line: what + how many (+ town).',
    '*50 bags cement harare* · *3kg wedding cake $60* · *fix my geyser mbare*',
    '',
    'Matching suppliers quote straight into this chat. You choose; your number stays private.',
  ].join('\n')
}

export function renderNeedConfirm(d: NeedDraft): string {
  return [
    '*Match this?* 🛒',
    `📦 ${[d.qty, d.item].filter(Boolean).join(' ')}`,
    `💰 ${d.budget || 'no budget given, quotes can set the price'}`,
    `📍 ${(d.city || 'countrywide').toUpperCase()}`,
    '',
    'Up to 5 supplier quotes arrive here. Reply *stop* to quiet it anytime.',
  ].join('\n')
}

export function renderNeedPosted(rqId: string, d: NeedDraft): string {
  return [
    `✅ Posted as *${rqId}* → suppliers in ${(d.city || 'Zimbabwe').toUpperCase()}.`,
    '',
    `Quotes land in this chat (max 5). Reply the quote\'s number to deal, or *stop* to quiet the thread.`,
  ].join('\n')
}

export function renderQuoteCard(
  rqId: string,
  supplierName: string,
  price: string,
  body: string,
  index: number,
  total: number,
  website?: string | null
): string {
  const head = `💬 *Quote ${index}/${total}* · ${rqId}`
  const lines = [head, `${supplierName}: ${price ? `*${price}*` : '(price in text below)'}`]
  if (body) lines.push(`✍️ ${body}`)
  const web = (website || '').trim()
  if (web) {
    const url = /^(https?:)?\/\//i.test(web) ? web : `https://${web}`
    lines.push(`🌐 ${url}`)
  }
  return lines.join('\n')
}

export function renderNeedSilence(rqId: string): string {
  return [`${rqId}: quotes full (5). This thread stays quiet.`, 'Reply *' + rqId + ' …* again only if the buyer reopens.'].join(' ')
}

export function renderNeedClosedByBuyer(rqId: string): string {
  return `✋ ${rqId} quieted, no more quotes relayed. Reply *${rqId} open* if you want more quotes.`
}

export function renderNeedFilled(rqId: string, when: string, winner: string): string {
  return `❌ ${rqId} was filled ${when} (won by *${winner}*). Reply 🛒 *menu* to post a new need.`
}

export function renderDealAsk(rqId: string): string {
  return [
    `🤝 Did the deal happen for *${rqId}*?`,
    'Tell me so I stop pinging suppliers either way:',
  ].join('\n')
}

export function renderCeremony(rqId: string, item: string, quoteLines: string[]): string {
  const lines = [
    `⏳ This thread goes quiet soon, *${rqId}* (${item}).`,
    '',
  ]
  if (quoteLines.length > 0) {
    lines.push('Quotes received:', ...quoteLines.map((q, i) => `${i + 1}. ${q}`), '')
  }
  lines.push('Sorted? Great, nothing to do.', 'Still on? Answer the 🤝 question:', '')
  return lines.join('\n')
}

export function renderEmptyResults(term: string): string {
  return [
    `No results for *${term}*.`,
    '',
    'Try: "plumber harare", "bread chinhoyi", "salon bulawayo".',
    'Send *help* for tips.',
  ].join('\n')
}

export function renderInvalidSelection(count: number): string {
  return `That number is not on the current screen: tap a business, reply a visible row number (1 to ${Math.min(count, 20)}), or tap *More results* if it appears.`
}

// ── Interactive screens ───────────────────────────────────────────────────

/** Body for the native list-message version of the results screen. */
export function renderResultsListBody(
  termDisplay: string,
  cityLabel: string | null,
  count: number,
  page = 0
): string {
  const header = cityLabel
    ? `*${capFirst(termDisplay)} near ${cityLabel}*`
    : `*${capFirst(termDisplay)} (countrywide)*`
  const lines = [
    header,
    '',
    `I found ${count} matching listing${count === 1 ? '' : 's'} in the current directory.`,
  ]
  const shown = page * RESULTS_PER_PAGE
  if (page === 0 && count > RESULTS_PER_PAGE) {
    lines.push(`Showing 1 to ${RESULTS_PER_PAGE}, tap *More results* for the rest.`)
  } else if (page > 0) {
    lines.push(`Showing ${shown + 1} to ${Math.min(count, shown + RESULTS_PER_PAGE)} of ${count}.`)
  }
  lines.push('', 'Tap a business below, reply with a number, or send a new search.')
  return lines.join('\n')
}

/** Build verification badges string for a result card */
function buildBadges(card: ResultCard): string {
  const badges: string[] = []
  if (card.verified) badges.push('✅')
  if (card.rating && card.rating > 0 && card.reviewCount && card.reviewCount > 0) {
    badges.push(`⭐${card.rating.toFixed(1)}(${card.reviewCount})`)
  }
  if (card.paymentStatus === 'active') badges.push('💎')
  if (card.responseTimeMinutes && card.responseTimeMinutes <= 15) badges.push('⚡')
  if (card.ordersFulfilled && card.ordersFulfilled >= 10) badges.push('📦')
  if (card.escrowEligible) badges.push('🛡️')
  return badges.length ? ` ${badges.join(' ')}` : ''
}

/** Price segment for list rows: same logic as searchCardPriceLine, but rows
 * are plain text (no markdown), so backticks are stripped. */
function rowPriceLine(card: ResultCard): string {
  const badges = buildBadges(card)
  if (card.item) {
    return card.item.price != null
      ? `${card.item.name}: ${monoUSD(card.item.price).replace(/`/g, '')}${badges}`
      : `${card.item.name}: Price not listed${badges}`
  }
  const range = monoPrice(card.priceRange).replace(/`/g, '')
  return range ? `💰 ${range}${badges}` : badges
}

// One WhatsApp list message holds at most 10 rows; one slot is reserved for
// the status row, so a page shows 9 businesses.
export const RESULTS_PER_PAGE = 9

/** Tappable rows for one results page: up to 9 businesses numbered
 * absolutely (page 2 starts at 10.), plus a trailing status row —
 * "→ More results…" when a next page exists, "✔ End of list" otherwise. */
export function resultRows(cards: ResultCard[], page = 0): InteractiveRow[] {
  const start = Math.max(0, page) * RESULTS_PER_PAGE
  const rows: InteractiveRow[] = cards
    .slice(start, start + RESULTS_PER_PAGE)
    .map((c, i) => {
      const price = rowPriceLine(c)
      const abs = start + i + 1
      const desc = `📍 ${displayLocation(c.city, c.area)}${c.km != null ? ` ~${Math.round(c.km)} km` : ''}${price ? ` · ${price}` : ''}`
      return { id: `sel_${abs}`, title: `${abs}. ${c.name}`, description: desc }
    })
  const shown = start + RESULTS_PER_PAGE
  if (cards.length > shown) {
    rows.push({
      id: 'more',
      title: '→ More results…',
      description: `Matches ${shown + 1}–${Math.min(cards.length, shown + RESULTS_PER_PAGE)} of ${cards.length}`,
    })
  } else {
    rows.push({
      id: 'end_list',
      title: '✔ End of list',
      description: `All ${cards.length} match${cards.length === 1 ? '' : 'es'} shown`,
    })
  }
  return rows
}

/** Main menu (opened by menu). Rows are by convention in route.
 * The body doubles as the search how-to: the directory has no separate
 * "search" entry point — typing IS searching. */
export function renderMainMenuBody(): string {
  const lines = [
    '*WA Directory* 🤖',
    'Find what you need: type product/service + your location.',
    'For a specific company, add its name to the search.',
    '',
    'Registering a business or personal contact? Tap ✎ Register below.',
  ]
  return lines.join('\n')
}

/** Greeting-only messages ("hi", "showed up" first contact): mirror the
 * caller's greeting word, then teach the two ways to find things. The menu
 * lives behind *menu*; this text is the brand-new contact's whole world. */
export function renderWelcomeInstructions(greeting?: string): string {
  return [
    greeting || 'Hey! 👋',
    '',
    'Type what you\'re looking for, the product or service + your location.',
    'e.g. *bread chinhoyi*, *plumber harare*',
    '',
    'Looking for a specific company? Just add its name to your search',
    'and I\'ll bring it up directly. e.g. *Mbuya\'s Kitchen harare*',
  ].join('\n')
}

/** Full first-contact welcome (owner-approved copy). The interactive menu is
 * attached to THIS message as the list body (menu below the text). */
export function renderFirstWelcome(name?: string, channelLink?: string): string {
  const who = (name || '').trim()
  const lines = [
    who ? `Welcome ${who} to WA Directory!` : 'Welcome to WA Directory!',
    'Looking for something or someone? Simply tell me what you need and your town, and I\'ll help you find a match.',
    '',
    '*What can you find?*',
    '🛍️ *Products & Services* — E.g. Bread Chinhoyi',
    '🏢 *Business Contacts* — E.g. Farm and City Harare',
    '👤 *Personal Contacts* — individuals listed on WA Directory',
    '🚨 *Emergency Contacts* — E.g. Police Chinhoyi, Fire Brigade Harare',
    '',
    '*Register your business and get:*',
    '🌐 A free business website',
    '🪪 A business card template',
    '📱 QR code templates',
    '🛒 An online shop linked to WhatsApp',
  ]
  if (channelLink) {
    lines.push(
      '',
      'Join our channel for live sales, updates and tutorials:',
      channelLink
    )
  }
  lines.push(
    '',
    'To register your business, post a need, order items or get help, open the menu below 👇'
  )
  return lines.join('\n')
}

/** Returning customers get a short, time-based greeting (owner-approved
 * copy). Harare is UTC+2 all year (CAT) — computed from server UTC time. */
export function renderWelcomeBack(name?: string): string {
  const hour = (new Date().getUTCHours() + 2) % 24
  const part = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'
  const first = (name || '').trim().split(' ')[0]
  const lines = [first ? `Good ${part}, ${first}!` : `Good ${part}!`]
  lines.push('What are we looking for today and where?')
  lines.push('')
  lines.push('If you need help or other options, open the menu below 👇')
  return lines.join('\n')
}

/** One-time pitch for just-registered businesses: the WhatsApp channel is
 * where live buyer needs surface. Free-form, sent while the 24h window is open. */
export function renderChannelPitch(channelLink: string): string {
  return [
    '📣 *Get free buyer leads on WhatsApp*',
    '',
    'Join our WhatsApp channel, we post live buyer needs like "50 bags cement Harare".',
    '',
    'When you see one, quote with a single reply:',
    'RQ-7181 $45 delivered',
    '',
    'If the buyer picks you, their contact card lands here. Your number stays private until then.',
    '',
    `🔗 ${channelLink}`,
  ].join('\n')
}

// ── Adaptive greeting ────────────────────────────────────────────────────
// Greeting-only messages ("hi", "hey there", "mangwanani", "sawubona"…)
// mirror the caller's own language, with their WhatsApp profile name when
// Meta provides it. Anything longer than a greeting falls through to the
// normal search flow so "hi plumber harare" is still a search.

const GREETING_FILLER = new Set([
  'there', 'shamwari', 'bre', 'bra', 'boss', 'bro', 'chief', 'everyone',
  'guys', 'team', 'sisi', 'sah', 'sir', 'madam', 'my', 'dude', 'fam',
])

interface GreetingRule {
  match: RegExp
  reply: string
}

const GREETING_RULES: GreetingRule[] = [
  // English
  { match: /\b(?:good\s+morning|morning)\b/i, reply: 'Good morning' },
  { match: /\b(?:good\s+afternoon|afternoon)\b/i, reply: 'Good afternoon' },
  { match: /\b(?:good\s+evening|evening)\b/i, reply: 'Good evening' },
  // Shona
  { match: /\bmangwanani\b/i, reply: 'Mangwanani' },
  { match: /\bmasikati\b/i, reply: 'Masikati' },
  { match: /\bmadekuro\b/i, reply: 'Madekuro' },
  { match: /\bmhoroi?\b/i, reply: 'Mhoro' },
  { match: /\bwakawaka\b/i, reply: 'Wakawaka' },
  { match: /\bsho\b/i, reply: 'Sho' },
  // Ndebele
  { match: /\bsawubona\b/i, reply: 'Sawubona' },
  { match: /\bsalibonani\b/i, reply: 'Salibonani' },
  { match: /\bkulenyane\b/i, reply: 'Kulenyane' },
  // English basics last — most specific time greetings win above.
  { match: /\b(?:hi|hiya|hey|hello|hie|hy)\b/i, reply: 'Hey' },
]

// Returns the mirrored greeting ("Mangwanani Tinashe!") for greeting-only
// messages, or null when this message should be handled by the normal flow.
export function renderGreetingBody(text: string, name?: string): string | null {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t || t.length > 40) return null
  const words = t.split(' ')
  if (words.length > 3) return null

  let greeting: string | null = null
  let greetingWords: string[] = []
  for (const rule of GREETING_RULES) {
    if (rule.match.test(t)) {
      greeting = rule.reply
      greetingWords = greeting.toLowerCase().split(/\s+/)
      break
    }
  }
  if (!greeting) return null

  const leftover = words
    .filter(w => !greetingWords.includes(w.toLowerCase()))
    .filter(w => !GREETING_FILLER.has(w.toLowerCase()))
  if (leftover.length > 1) return null
  if (leftover.length === 1) {
    const extra = leftover[0]
    // "hi bread chinhoyi" is a search; "hey there" is a greeting. A name-like
    // extra word is allowed ("hey Tinashe"), a town is not ("hi harare").
    if (/\d/.test(extra) || extra.length > 30) return null
    if (/^(harare|bulawayo|chitungwiza|mutare|gweru|kwekwe|kadoma|masvingo|chinhoyi|epworth|marondera|hwange|victoria falls|gwanda|rusape|bindura|beatrice|norton|banket|ruwa|chegutu|zvishavane|karoi|kariba|kunamhlwa|mashava|empandeni|sondela)$/i.test(extra)) return null
  }

  const who = name?.trim() ? ` ${name.trim().split(' ')[0]}` : ''
  return `${greeting}${who}!`
}

/** Body for the nearby-towns results screen as a native list message. */
export function renderNearbyListBody(
  termDisplay: string,
  city: string,
  count: number,
  page = 0
): string {
  const lines = [`No ${termDisplay} in *${city}*. Nearest:`]
  if (page === 0 && count > RESULTS_PER_PAGE) {
    lines.push(`Showing 1 to ${RESULTS_PER_PAGE} of ${count}, tap *More results* for the rest.`)
  } else if (page > 0) {
    const shown = page * RESULTS_PER_PAGE
    lines.push(`Showing ${shown + 1} to ${Math.min(count, shown + RESULTS_PER_PAGE)} of ${count}.`)
  }
  lines.push('', `Tap a business below to view details, or try *whole country*.`)
  return lines.join('\n')
}

/** Body for distance-ranked results from a shared location ("📍 Near me").
 * Rows carry a "~N km" badge; copy should never say "nearest", the whole
 * screen IS the nearest. */
export function renderNearMeListBody(
  termDisplay: string,
  count: number,
  page = 0
): string {
  const lines = [
    `*${capFirst(termDisplay)} near you* 📍`,
    '',
    `Closest matches to your shared location, ranked by distance, ${count} found.`,
  ]
  if (page === 0 && count > RESULTS_PER_PAGE) {
    lines.push(`Showing 1 to ${RESULTS_PER_PAGE}, tap *More results* for the rest.`)
  } else if (page > 0) {
    const shown = page * RESULTS_PER_PAGE
    lines.push(`Showing ${shown + 1} to ${Math.min(count, shown + RESULTS_PER_PAGE)} of ${count}.`)
  }
  lines.push('', 'Tap a business below, reply with a number, or send a new search.')
  return lines.join('\n')
}

/** Safe outbound error note shown to customers (rare; nothing is exposed). */
export function renderErrorCard(): string {
  return [
    '*We hit a problem on our side.*',
    '',
    'Please send your search again in a moment, or reply *help* for tips.',
  ].join('\n')
}

export function FALLBACK_HELP_LINES(siteUrl: string, channelLink?: string): string[] {
  const lines = [
    '*WA DIRECTORY*',
    '> Your next find is just a message away.',
    '',
    'Discover products, find services, connect with businesses, and shop right here on WhatsApp.',
    '',
    '*🔎 FIND WHAT YOU NEED*',
    '',
    'Tell me what you\'re looking for and where.',
    '',
    '`bread chinhoyi`',
    '`plumber in bulawayo`',
    '`solar installer harare`',
    '',
    'Not sure where to start? Just send `plumber` and I\'ll ask for your town.',
    '',
    'You can also:',
    '🎙️ Send a voice note in English.',
    '📸 Send a photo of what you\'re looking for.',
    '🏢 Search for a specific company by name.',
    '',
    '*🛍️ SHOP YOUR WAY*',
    '',
    'Found what you need? Reply with a number from `1` to `5` to get the contact details.',
    '',
    'Want to order from multiple shops at once?',
    '',
    'Send your shopping list:',
    '`order 2 bread, 1 cake`',
    '',
    'I\'ll match your items with shops that stock them and organise your order by shop.',
    '',
    '*Your orders:* `myorders`',
    '*Shop orders:* `orders`',
    '',
    '*🌍 DISCOVER MORE*',
    '',
    '🛍️ Products and services',
    '🏢 Business contacts',
    '👤 Personal contacts listed on WA Directory',
    '',
    '*🏪 GET YOUR BUSINESS DISCOVERED*',
    '',
    'Want customers to find you?',
    '',
    '*Register your business:* `register`',
    '*List your personal contact:* `contact`',
    '',
    '*💳 MANAGE YOUR SUBSCRIPTION*',
    '',
    '*View payments and expiry countdowns:* `paid`',
    '*Pay your subscription:* `pay`',
    '',
    '*⚙️ QUICK COMMANDS*',
    '',
    '`cancel` - Cancel your current action.',
    '`help` - See what you can do.',
    '',
    '> WA Directory. A shortcut to buying and selling without the hassle.',
    '',
    `🌐 ${siteUrl}`,
    '',
    '📲 *LIVE BUYS & DEALS*',
    'Join our WhatsApp Channel for the latest offers, deals, and discoveries.',
    '',
    channelLink || 'https://whatsapp.com/channel/0029Vb90F2B60eBcE52vnk1S',
    '',
    '📞 *CONTACT FOR HELP*',
    '+263773791864',
    'wadirectory@proton.me',
  ]

  return lines
}

export function SUPPLIER_HELP_LINES(siteUrl: string, channelLink?: string): string[] {
  const lines = [
    '*WA DIRECTORY | SUPPLIER GUIDE*',
    '> More customers. More enquiries. More opportunities.',
    '',
    'Your products could be exactly what someone is looking for.',
    '',
    'WA Directory connects buyers with suppliers, helping customers discover what you offer and giving your business more opportunities to make sales.',
    '',
    '*📦 GET YOUR PRODUCTS DISCOVERED*',
    '',
    'Buyers search for products and services by name and location.',
    '',
    'For example:',
    '`bread chinhoyi`',
    '`cement harare`',
    '`laptops bulawayo`',
    '',
    'When your business matches a search, buyers can discover your listing and request your contact details.',
    '',
    '*🛍️ RECEIVE ORDERS*',
    '',
    'Buyers can send shopping lists such as:',
    '',
    '`order 2 bread, 1 cake`',
    '',
    'WA Directory matches items with shops that stock them and organises the order by shop.',
    '',
    '*Your shop could be part of the next order.*',
    '',
    '*🏪 GET YOUR BUSINESS ON WA DIRECTORY*',
    '',
    'Not listed yet?',
    '',
    'Send `register` to get started.',
    '',
    'Already registered? Keep your business information and product listings up to date so customers can find you.',
    '',
    '*📋 MANAGE YOUR BUSINESS*',
    '',
    '`orders` - View orders from customers.',
    '`paid` - Check your subscription and expiry countdown.',
    '`pay` - Pay your subscription.',
    '',
    '*⚙️ QUICK COMMANDS*',
    '',
    '`cancel` - Cancel your current action.',
    '`help` - View available assistance.',
    '',
    '> Your next customer could already be searching.',
    '',
    `🌐 ${siteUrl}`,
    '',
    '📲 *LIVE BUYS & DEALS*',
    'Join our WhatsApp Channel for offers, deals, and new opportunities.',
    '',
    channelLink || 'https://whatsapp.com/channel/0029Vb90F2B60eBcE52vnk1S',
    '',
    '📞 *CONTACT FOR HELP*',
    '+263773791864',
    'wadirectory@proton.me',
  ]

  return lines
}
