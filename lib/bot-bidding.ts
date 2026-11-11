import { getSupabase } from './supabase-server.js'
import { sendWhatsAppMessage, sendInteractiveList, sendInteractiveButtons } from './whatsapp.js'
import { initiateEcoCashPayment, paynowConfigured } from './paynow.js'
import { SITE_URL } from './site-url.js'
import { digitsOnly } from './phone.js'
import { logPaymentEvent } from './payment-events.js'
import { fmtHarare } from './needs.js'
import { zimbabweCities } from '../data/zimbabwe-locations.js'

// Fair-bidding rules (single engine for the WhatsApp bot; the webapp keeps a
// mirrored copy in wa.directory/lib/bot-bidding.ts for its legacy webhook +
// portal API — keep the two in sync):
// - Locals bid their own town only. Open spot min $0.50; outbid min = current fee + $0.50.
// - Nationwide tier (is_remote, city='') any time: $0.50 × towns with no active local #1.
// - Takeover of a town's #1 (is_remote, city set): only where a LOCAL currently
//   holds it, at a 2× premium of the local's fee. Locals can always reclaim.
//
// One WhatsApp number can own several listings, so every lookup returns ALL of
// the sender's businesses and the interactive flow asks which one is bidding.
// The chosen listing rides along inside the callback ids:
//   bid_biz_<rowId>
//   bid_cat_<rowId>__<category>
//   bid_nationwide_<rowId>__<category>
//   bid_city_<rowId>__<category>__<city>
//   bid_amt_<amount>__<rowId>__<category>__<city>
// Ids without the rowId (sent before this existed) still resolve by phone.
export const MIN_BID_GAP = 0.5
export const LOCAL_BID_BASE = 0.5
export const NATIONWIDE_TOWN_FEE = 0.5
export const TAKEOVER_PREMIUM = 2

type SupabaseClient = ReturnType<typeof getSupabase>

export type BidBusiness = {
  id: string
  name: string
  business_id: string | null
  category: string[] | null
  city: string | null
  is_remote: boolean | null
}

const BID_BUSINESS_FIELDS = 'id, name, business_id, category, city, is_remote'

/** The sender's number as stored, plus the usual variants (+263…, 0…). */
function phoneVariants(phone: string): string[] {
  const digits = digitsOnly(phone)
  const out = new Set<string>()
  if (phone) out.add(phone)
  if (digits) {
    out.add(digits)
    out.add(`+${digits}`)
    if (digits.startsWith('263')) out.add(`0${digits.slice(3)}`)
  }
  return [...out]
}

/**
 * Every listing owned by this WhatsApp number (a number can own several).
 * Ordered oldest-first so the first listing is the owner's original one.
 */
export async function loadMyBusinesses(phone: string): Promise<BidBusiness[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('businesses')
    .select(BID_BUSINESS_FIELDS)
    .in('phone', phoneVariants(phone))
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[bidding] my businesses query failed:', error.message)
    return []
  }
  return (data || []) as unknown as BidBusiness[]
}

/**
 * Resolve the listing a callback is about. `rowId` comes from the id and is
 * only accepted when it belongs to the sender; without it we fall back to the
 * sender's first listing (old ids and one-listing owners).
 */
async function resolveSenderBusiness(phone: string, rowId?: string): Promise<BidBusiness | null> {
  const mine = await loadMyBusinesses(phone)
  if (!mine.length) return null
  if (rowId) return mine.find((b) => b.id === rowId) || null
  return mine[0]
}

/** Towns (static dataset) where this category has NO active #1 spot. */
export async function unoccupiedTownCount(supabase: SupabaseClient, category: string): Promise<number> {
  const { data: spots } = await supabase
    .from('rank_spots')
    .select('city')
    .eq('category', category)
    .eq('position', 1)
    .eq('status', 'active')
  const held = new Set((spots || []).map((s: { city: string | null }) => s.city).filter(Boolean) as string[])
  return zimbabweCities.filter((c) => !held.has(c.name)).length
}

/** Active #1 spots in real towns whose holder is a LOCAL (non-remote) business. */
export async function localHeldSpots(supabase: SupabaseClient, category: string) {
  const { data: spots } = await supabase
    .from('rank_spots')
    .select('city, monthly_fee, business_id')
    .eq('category', category)
    .eq('position', 1)
    .eq('status', 'active')
    .neq('city', '')
  const rows = (spots || []).filter((s: { city: string | null }) => s.city)
  if (!rows.length) return []
  const { data: holders } = await supabase
    .from('businesses')
    .select('id, name, is_remote')
    .in('id', rows.map((r: { business_id: string }) => r.business_id))
  const localIds = new Set((holders || []).filter((h: { is_remote: boolean | null }) => h.is_remote !== true).map((h: { id: string }) => h.id))
  return rows.filter((r: { business_id: string }) => localIds.has(r.business_id))
}

/**
 * Resolve the minimum bid and mode for a (category, city, isRemote) scope.
 * Single source of truth for pricing, used by the WhatsApp flow.
 */
export async function resolveBidScope(
  supabase: SupabaseClient,
  category: string,
  city: string,
  isRemote: boolean
): Promise<
  | { ok: true; mode: 'open' | 'outbid' | 'nationwide' | 'takeover'; min: number; currentFee: number; holderId?: string; towns?: number }
  | { ok: false; reason: string }
> {
  const scopeCity = city || ''
  const { data: spot } = await supabase
    .from('rank_spots')
    .select('monthly_fee, business_id')
    .eq('category', category)
    .eq('city', scopeCity)
    .eq('position', 1)
    .eq('status', 'active')
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  const currentFee = spot ? Number(spot.monthly_fee || 0) : 0

  // Local businesses: own town only, standard auction rules.
  if (!isRemote) {
    return {
      ok: true,
      mode: currentFee > 0 ? 'outbid' : 'open',
      min: currentFee > 0 ? currentFee + MIN_BID_GAP : LOCAL_BID_BASE,
      currentFee,
      holderId: spot?.business_id,
    }
  }

  // Remote (nationwide) business targeting a specific town = takeover.
  if (scopeCity) {
    if (!spot) {
      return {
        ok: false,
        reason:
          'That town has no local #1 to take over — towns without a #1 are covered by the *Nationwide* slot. Type `bid` and pick *Nationwide*.',
      }
    }
    const { data: holder } = await supabase
      .from('businesses')
      .select('is_remote, name')
      .eq('id', spot.business_id)
      .maybeSingle()
    if (holder?.is_remote === true) {
      return { ok: false, reason: 'Only towns where a *local* business holds #1 can be taken over, at 2× their fee.' }
    }
    return {
      ok: true,
      mode: 'takeover',
      min: Math.round(currentFee * TAKEOVER_PREMIUM * 100) / 100,
      currentFee,
    }
  }

  // Remote business, no town = the nationwide tier.
  const towns = await unoccupiedTownCount(supabase, category)
  if (towns <= 0) {
    return {
      ok: false,
      reason:
        'Locals hold #1 in every town for this category right now, so the nationwide slot is closed. You can take over a specific town at 2× the local fee — type `bid` to see the list.',
    }
  }
  return {
    ok: true,
    mode: 'nationwide',
    min: Math.round(towns * NATIONWIDE_TOWN_FEE * 100) / 100,
    currentFee: 0,
    towns,
  }
}

/** Category picker for one listing. */
async function showBidCategories(phone: string, business: BidBusiness) {
  const categories = business.category || []
  if (categories.length === 0) {
    await sendWhatsAppMessage(phone, 'Your listing has no categories. Add categories via the portal to bid.')
    return
  }

  const rows = categories.slice(0, 10).map((c: string) => ({
    id: `bid_cat_${business.id}__${c}`,
    title: c,
    description: business.is_remote ? 'Nationwide — pick city next' : business.city || 'N/A',
  }))

  await sendInteractiveList(
    phone,
    `*Bid for #1 Spot* 🏆\nYour business: *${business.name}* (${business.business_id})\nPick a category:`,
    rows,
    'Choose category'
  )
}

/**
 * Handle the main `bid` command.
 * Usage: `bid` or `bid <category> <city|nationwide> <amount>`
 */
export async function handleBidCommand(phone: string, text: string) {
  const mine = await loadMyBusinesses(phone)

  if (mine.length === 0) {
    await sendWhatsAppMessage(phone, 'No business found for this WhatsApp number. Register first with `register`.')
    return
  }

  // Parse arguments: bid <category> <city> <amount>
  const parts = text.trim().split(/\s+/)
  if (parts.length >= 4) {
    // Quick bid: bid plumber harare 1.50 (or "nationwide" for the nationwide slot)
    const category = parts[1]
    const wantsNationwide = parts[2].toLowerCase() === 'nationwide'
    const quotedCity = wantsNationwide ? '' : parts[2]
    const amount = parseFloat(parts[3])

    const eligible = mine.filter((b) => (b.category || []).includes(category))
    if (!eligible.length) {
      const allCats = [...new Set(mine.flatMap((b) => b.category || []))]
      await sendWhatsAppMessage(
        phone,
        `Category "${category}" not found on your listings. Your categories: ${allCats.join(', ')}`
      )
      return
    }

    // Prefer the listing that sits in the quoted town; otherwise the first match.
    const business =
      eligible.find((b) =>
        b.is_remote ? quotedCity === '' : (b.city || '').toLowerCase() === quotedCity.toLowerCase()
      ) || eligible[0]

    const city = business.is_remote ? quotedCity : business.city || ''
    if (!business.is_remote && quotedCity && quotedCity.toLowerCase() !== (business.city || '').toLowerCase()) {
      await sendWhatsAppMessage(phone, `You can only bid in your listing's city (${business.city}).`)
      return
    }

    await handleBidAmount(phone, business.id, category, city, amount)
    return
  }

  // One listing: straight to its categories. Several: ask which listing first.
  if (mine.length === 1) {
    await showBidCategories(phone, mine[0])
    return
  }

  const rows = mine.slice(0, 10).map((b) => ({
    id: `bid_biz_${b.id}`,
    title: (b.name || 'Listing').slice(0, 24),
    description: `${b.business_id || ''} · ${b.is_remote ? 'Nationwide' : b.city || 'No town'}`.slice(0, 72),
  }))

  await sendInteractiveList(
    phone,
    `*Bid for #1 Spot* 🏆\nThis number has ${mine.length} listings. Which one are you bidding for?`,
    rows,
    'Choose business'
  )
}

/**
 * Handle business selection when the number owns several listings.
 * Callback ID format: bid_biz_<rowId>
 */
export async function handleBidBusinessSelection(phone: string, selectionId: string) {
  const rowId = selectionId.replace('bid_biz_', '')
  const business = await resolveSenderBusiness(phone, rowId)

  if (!business) {
    await sendWhatsAppMessage(phone, 'That listing is not on this WhatsApp number. Type `bid` to start again.')
    return
  }

  await showBidCategories(phone, business)
}

/**
 * Handle category selection from interactive list.
 * Callback ID format: bid_cat_<rowId>__<category> (legacy: bid_cat_<category>)
 */
export async function handleBidCategorySelection(phone: string, selectionId: string) {
  const supabase = getSupabase()

  const rest = selectionId.replace('bid_cat_', '')
  const sep = rest.indexOf('__')
  const rowId = sep >= 0 ? rest.slice(0, sep) : ''
  const category = sep >= 0 ? rest.slice(sep + 2) : rest

  const business = await resolveSenderBusiness(phone, rowId || undefined)

  if (!business) {
    await sendWhatsAppMessage(phone, 'No business found for this WhatsApp number.')
    return
  }

  if (!business.category?.includes(category)) {
    await sendWhatsAppMessage(phone, `Category "${category}" not found on your listing.`)
    return
  }

  // If nationwide, show the nationwide slot + towns held by locals (takeover)
  if (business.is_remote) {
    const unoccupied = await unoccupiedTownCount(supabase, category)
    const nationwideFee = Math.round(unoccupied * NATIONWIDE_TOWN_FEE * 100) / 100
    const held = await localHeldSpots(supabase, category)

    const rows: { id: string; title: string; description: string }[] = []
    if (unoccupied > 0) {
      rows.push({
        id: `bid_nationwide_${business.id}__${category}`,
        title: '🌍 Nationwide',
        description: `$${nationwideFee.toFixed(2)} = $0.50 × ${unoccupied} open towns`,
      })
    }
    for (const s of held.slice(0, 8)) {
      rows.push({
        id: `bid_city_${business.id}__${category}__${s.city}`,
        title: s.city,
        description: `Take over — 2× their $${Number(s.monthly_fee || 0).toFixed(2)}`,
      })
    }

    if (rows.length === 0) {
      await sendWhatsAppMessage(
        phone,
        `Locals hold #1 in every town for *${category}*, so there is nothing to bid on right now. Check back later.`
      )
      return
    }

    await sendInteractiveList(
      phone,
      `*Bid for #1 in ${category}* 📍\n\n` +
        `• *Nationwide*: $0.50 per town with no local #1 (${unoccupied} open). You show first wherever no local has bid — locals always rank above you in their own towns.\n` +
        `• *Take over a town*: only where a local holds #1, at 2× their fee. Locals can always reclaim at their fee + $0.50.`,
      rows,
      'Choose scope'
    )
    return
  }

  // Not nationwide - go straight to amount selection
  await showBidAmountOptions(phone, business.id, category, business.city || '')
}

/**
 * Handle town selection for nationwide businesses (takeover of a local-held #1).
 * Callback ID format: bid_city_<rowId>__<category>__<city>
 */
export async function handleBidCitySelection(phone: string, selectionId: string) {
  const supabase = getSupabase()

  const rest = selectionId.replace('bid_city_', '')
  let rowId = ''
  let category = ''
  let city = ''
  if (rest.includes('__')) {
    const bits = rest.split('__')
    rowId = bits[0]
    category = bits[1] || ''
    city = bits.slice(2).join('__')
  } else {
    // Legacy id: bid_city_<category>_<city>
    const bits = rest.split('_')
    category = bits[0]
    city = bits.slice(1).join(' ')
  }

  const business = await resolveSenderBusiness(phone, rowId || undefined)

  if (!business) {
    await sendWhatsAppMessage(phone, 'Business not found.')
    return
  }

  // Takeover rules: the town's #1 must be held by a LOCAL, priced at 2× their fee.
  const scope = await resolveBidScope(supabase, category, city, business.is_remote === true)
  if (!scope.ok) {
    await sendWhatsAppMessage(phone, scope.reason)
    return
  }

  await showBidAmountOptions(phone, business.id, category, city, scope)
}

/**
 * Handle the nationwide-slot selection for nationwide businesses.
 * Callback ID format: bid_nationwide_<rowId>__<category>
 */
export async function handleBidNationwideSelection(phone: string, selectionId: string) {
  const supabase = getSupabase()

  const rest = selectionId.replace('bid_nationwide_', '')
  const sep = rest.indexOf('__')
  const rowId = sep >= 0 ? rest.slice(0, sep) : ''
  const category = sep >= 0 ? rest.slice(sep + 2) : rest

  const business = await resolveSenderBusiness(phone, rowId || undefined)

  if (!business) {
    await sendWhatsAppMessage(phone, 'Business not found.')
    return
  }

  const scope = await resolveBidScope(supabase, category, '', business.is_remote === true)
  if (!scope.ok) {
    await sendWhatsAppMessage(phone, scope.reason)
    return
  }

  await showBidAmountOptions(phone, business.id, category, '', scope)
}

/**
 * Amount-button callback ids carry the full bid scope so a tap is
 * self-contained: bid_amt_<amount>__<rowId>__<category>__<city> (empty city =
 * nationwide). Older ids without the rowId still parse (businessId '').
 */
export function parseBidAmountId(
  id: string
): { amount: number; businessId: string; category: string; city: string } | null {
  const m = id.match(/^bid_amt_([\d.]+)__(.*)$/)
  if (!m) return null
  const amount = parseFloat(m[1])
  if (isNaN(amount)) return null
  const bits = m[2].split('__')
  if (bits.length >= 3) {
    return {
      amount,
      businessId: bits[0].trim(),
      category: (bits[1] || '').trim(),
      city: bits.slice(2).join('__').replace(/_/g, ' ').trim(),
    }
  }
  return {
    amount,
    businessId: '',
    category: (bits[0] || '').trim(),
    city: (bits[1] || '').replace(/_/g, ' ').trim(),
  }
}

/**
 * Show current #1 fee and bid amount options.
 * `scope` (from resolveBidScope) carries the pricing mode; locals resolve it here.
 */
async function showBidAmountOptions(
  phone: string,
  businessId: string,
  category: string,
  city: string,
  scope?: Awaited<ReturnType<typeof resolveBidScope>>
) {
  const supabase = getSupabase()

  const resolved = scope || (await resolveBidScope(supabase, category, city, false))
  if (!resolved.ok) {
    await sendWhatsAppMessage(phone, resolved.reason)
    return
  }
  const minBid = resolved.min

  // Get business name for display
  const { data: business } = await supabase
    .from('businesses')
    .select('name, business_id')
    .eq('id', businessId)
    .maybeSingle()

  let message = `*Bid for #1: ${category}* ${city ? `in ${city}` : '(nationwide)'}\n`
  message += `Business: *${business?.name || 'Your business'}* (${business?.business_id})\n\n`

  if (resolved.mode === 'nationwide') {
    message += `Nationwide slot: you show *first* in every town with no local #1 (${resolved.towns} open towns), and below locals where they hold #1.\n`
    message += `Price: *$${minBid.toFixed(2)}* = $${NATIONWIDE_TOWN_FEE.toFixed(2)} × ${resolved.towns} open towns (one-time)\n\n`
  } else if (resolved.mode === 'takeover') {
    message += `Takeover: the current #1 is a local business. Takeover price = 2× their fee.\n`
    message += `Current fee paid: $${resolved.currentFee.toFixed(2)} → your price: *$${minBid.toFixed(2)}* (one-time)\n`
    message += `Locals can always reclaim at their fee + $${MIN_BID_GAP.toFixed(2)}.\n\n`
  } else if (resolved.mode === 'outbid') {
    message += `Current #1: ${resolved.holderId === businessId ? 'YOU 👑' : 'Another business'}\n`
    message += `Current fee paid: $${resolved.currentFee.toFixed(2)} (one-time)\n`
    message += `Minimum bid: *$${minBid.toFixed(2)}* (current fee + $${MIN_BID_GAP.toFixed(2)})\n`
  } else {
    message += `Current #1: *OPEN* 🟢\n`
    message += `Minimum bid: *$${minBid.toFixed(2)}* (one-time)\n`
  }

  message += `Pick an amount, or tap *Custom…* to name your own:`

  // Quick amount buttons (minBid, minBid+0.50) plus Custom.
  // WhatsApp allows at most THREE reply buttons and sendInteractiveButtons
  // silently drops the rest, so the set must never exceed three — Custom stays
  // last in the list but must still survive the cut, hence only two amounts.
  // The id carries the scope so the tap needs no stored conversation state.
  const amounts = [minBid, Math.round((minBid + 0.5) * 100) / 100]
  const scopeSuffix = `__${businessId}__${category}__${city}`

  const buttons = amounts.map(a => ({
    id: `bid_amt_${a.toFixed(2)}${scopeSuffix}`,
    title: `$${a.toFixed(2)}`
  }))

  buttons.push({ id: `bid_amt_custom${scopeSuffix}`, title: 'Custom…' })

  await sendInteractiveButtons(phone, message, buttons)
}

/**
 * Handle bid amount selection.
 * Called directly with (businessId, category, city, amount) by quick bids,
 * or via the scope-carrying button id from the webhook router.
 */
export async function handleBidAmount(phone: string, businessId: string, category: string, city: string, amount: number) {
  const supabase = getSupabase()

  // Server-side pricing guard (single source of truth with the portal API)
  const { data: bidder } = await supabase
    .from('businesses')
    .select('is_remote')
    .eq('id', businessId)
    .maybeSingle()
  const scope = await resolveBidScope(supabase, category, city || '', bidder?.is_remote === true)
  if (!scope.ok) {
    await sendWhatsAppMessage(phone, scope.reason)
    return
  }
  const currentFee = scope.currentFee

  if (amount < scope.min) {
    await sendWhatsAppMessage(
      phone,
      scope.mode === 'takeover'
        ? `Takeover of *${category}* in ${city} costs 2× the local's fee ($${currentFee.toFixed(2)}) = *$${scope.min.toFixed(2)}* minimum.`
        : scope.mode === 'nationwide'
          ? `The nationwide slot costs $${NATIONWIDE_TOWN_FEE.toFixed(2)} per open town — right now that is *$${scope.min.toFixed(2)}* minimum (${scope.towns} open towns).`
          : `Your bid of $${amount.toFixed(2)} is below the minimum of $${scope.min.toFixed(2)}. You must beat the current #1 by at least $${MIN_BID_GAP.toFixed(2)}.`
    )
    return
  }

  // If Paynow not configured, inform user
  if (!paynowConfigured()) {
    await sendWhatsAppMessage(
      phone,
      `Online payments are not enabled yet. Your bid of $${amount.toFixed(2)} for *${category}* ${city ? `in ${city}` : ''} has been recorded. An admin will contact you to confirm payment.`
    )
    return
  }

  // Ask for EcoCash phone number. Include the scope tokens so the confirm
  // step can price the exact (category, city) the user picked.
  const scopeToken = city ? `${category} in ${city}` : `${category} nationwide`
  const beatsLine =
    scope.mode === 'takeover'
      ? `Takeover price = 2× the local's $${currentFee.toFixed(2)} fee`
      : scope.mode === 'nationwide'
        ? `Covers ${scope.towns} open towns at $${NATIONWIDE_TOWN_FEE.toFixed(2)} each`
        : currentFee > 0
          ? `Beats current #1 ($${currentFee.toFixed(2)}) by $${(amount - currentFee).toFixed(2)}`
          : 'Spot is open!'
  await sendWhatsAppMessage(
    phone,
    `*Confirm Bid* ✅\n\n` +
    `Category: *${category}*\n` +
    `Location: ${city || 'Nationwide'}\n` +
    `Bid amount: *$${amount.toFixed(2)}* (one-time payment)\n` +
    `${beatsLine}\n\n` +
    `To pay, reply with your EcoCash number in this format:\n` +
    `\`confirm ${amount.toFixed(2)} <ecocash-number> ${scopeToken}\`\n` +
    `Example: \`confirm ${amount.toFixed(2)} 0771234567 ${scopeToken}\`\n` +
    `You'll receive a PIN prompt on that number — approve it to confirm your bid.`
  )
}

/**
 * Handle bid confirmation with phone number.
 * Expected format: "confirm <amount> <phone> [<category> [in <city> | nationwide]]"
 * The listing is chosen by category when the number owns several.
 */
export async function handleBidConfirm(phone: string, text: string) {
  const supabase = getSupabase()

  // Parse: confirm 1.50 0771234567 plumber in harare
  const parts = text.trim().split(/\s+/)
  if (parts.length < 3) {
    await sendWhatsAppMessage(phone, 'Usage: `confirm <amount> <phone> <category> [in <city> | nationwide]` (e.g. `confirm 1.50 0771234567 plumbing in Harare`)')
    return
  }

  const amount = parseFloat(parts[1])
  const payerPhone = parts[2]

  if (isNaN(amount) || amount <= 0) {
    await sendWhatsAppMessage(phone, 'Invalid amount.')
    return
  }

  const payerClean = digitsOnly(payerPhone)
  if (payerClean.length < 9) {
    await sendWhatsAppMessage(phone, 'Invalid EcoCash phone number.')
    return
  }

  const mine = await loadMyBusinesses(phone)

  if (mine.length === 0) {
    await sendWhatsAppMessage(phone, 'Business not found.')
    return
  }

  // Parse the optional scope tokens: "<category> [in <city> | nationwide]".
  // Falls back to the listing's own scope when omitted (single-listing owners).
  const rest = parts.slice(3).join(' ').trim()
  const first = mine[0]
  let category = mine.length === 1 ? first.category?.[0] || '' : ''
  let city = first.is_remote ? '' : first.city || ''

  if (rest) {
    if (/\bnationwide\b/i.test(rest)) {
      const cat = rest.replace(/\bnationwide\b/i, '').trim()
      if (cat) category = cat
      city = ''
    } else {
      const inMatch = rest.match(/^(.+?)\s+in\s+(.+)$/i)
      if (inMatch) {
        category = inMatch[1].trim()
        city = inMatch[2].trim()
      } else {
        category = rest
        if (!first.is_remote) city = first.city || ''
      }
    }
  }

  if (!category) {
    await sendWhatsAppMessage(
      phone,
      mine.length > 1
        ? 'Your number has several listings. Include the category: `confirm <amount> <phone> <category> [in <city> | nationwide]`'
        : 'No categories on your listing.'
    )
    return
  }

  // Pick the listing that actually carries this category.
  const business = mine.find((b) => (b.category || []).includes(category)) || first

  if (!business.category?.includes(category)) {
    const names = mine.map((b) => b.name).join(', ')
    await sendWhatsAppMessage(
      phone,
      `Category "${category}" not found on your listing. Your categories: ${(business.category || []).join(', ')}${mine.length > 1 ? ` (listings: ${names})` : ''}`
    )
    return
  }
  if (!business.is_remote && city && city.toLowerCase() !== (business.city || '').toLowerCase()) {
    await sendWhatsAppMessage(phone, `You can only bid in your listing's city (${business.city}).`)
    return
  }
  if (!business.is_remote) city = business.city || ''

  // Server-side pricing guard (same rules as the portal API)
  const scope = await resolveBidScope(supabase, category, city || '', business.is_remote === true)
  if (!scope.ok) {
    await sendWhatsAppMessage(phone, scope.reason)
    return
  }
  if (amount < scope.min) {
    await sendWhatsAppMessage(phone, `Bid must be at least $${scope.min.toFixed(2)} for *${category}* ${city ? `in ${city}` : '(nationwide)'}.`)
    return
  }

  // Check for existing pending bid (no period filter)
  const { data: existing } = await supabase
    .from('bids')
    .select('id')
    .eq('business_id', business.id)
    .eq('category', category)
    .eq('city', city)
    .eq('position', 1)
    .eq('status', 'pending')
    .maybeSingle()

  let bidId = existing?.id

  if (bidId) {
    // Update existing bid
    const { error } = await supabase
      .from('bids')
      .update({ amount, payer_phone: payerClean })
      .eq('id', bidId)
    if (error) {
      await sendWhatsAppMessage(phone, 'Failed to update bid. Please try again.')
      return
    }
  } else {
    // Create new bid (period can be current month for tracking, but spot is indefinite)
    const period = new Date().toISOString().slice(0, 7) // YYYY-MM
    const { data: inserted, error } = await supabase
      .from('bids')
      .insert({
        business_id: business.id,
        category,
        city: city || '',
        position: 1,
        amount,
        period,
        status: 'pending',
        payer_phone: payerClean,
      })
      .select('id')
    if (error || !inserted?.[0]?.id) {
      await sendWhatsAppMessage(phone, 'Failed to create bid. Please try again.')
      return
    }
    bidId = inserted[0].id
  }

  // Initiate EcoCash payment
  const init = await initiateEcoCashPayment({
    reference: `BID-${bidId}`,
    amount,
    phone: payerClean,
    additionalInfo: `Ranking bid: ${category}${city ? ` in ${city}` : ''}`,
    resultUrl: `${SITE_URL}/api/paynow/result`,
    returnUrl: `${SITE_URL}/portal/ranking`,
  })

  if (!init.ok || !init.pollUrl) {
    await sendWhatsAppMessage(phone, `Could not start EcoCash payment: ${init.error || 'Unknown error'}`)
    return
  }

  // Store poll URL
  await supabase
    .from('bids')
    .update({ paynow_poll_url: init.pollUrl, paynow_reference: init.paynowReference || null })
    .eq('id', bidId)

  await logPaymentEvent({
    eventType: 'payment_initiated',
    businessId: business.id,
    bidId,
    detail: { amount, category, city: city || '', payer: payerClean, paynowRef: init.paynowReference || null },
  })

  // Send payment instructions
  await sendWhatsAppMessage(phone, init.instructions || `EcoCash prompt sent to +${payerClean}. Enter your PIN to confirm the bid of $${amount.toFixed(2)} for *${category}*${city ? ` in ${city}` : ''}.`)

  // Tell them to wait
  await sendWhatsAppMessage(phone, 'Your bid will activate automatically once the payment is confirmed. You\'ll receive a confirmation here.')
}

/**
 * Handle "my bids" command - show bids across all of the sender's listings.
 */
export async function handleMyBidsCommand(phone: string) {
  const supabase = getSupabase()

  const mine = await loadMyBusinesses(phone)

  if (mine.length === 0) {
    await sendWhatsAppMessage(phone, 'No business found for this WhatsApp number.')
    return
  }

  const names = new Map(mine.map((b) => [b.id, b.name] as const))

  // Show all bids (no period filter)
  const { data: bids } = await supabase
    .from('bids')
    .select('id, business_id, category, city, amount, status, paynow_paid_at, created_at')
    .in('business_id', mine.map((b) => b.id))
    .order('created_at', { ascending: false })

  const header =
    mine.length === 1
      ? `Business: *${mine[0].name}* (${mine[0].business_id})`
      : `Listings: ${mine.map((b) => `*${b.name}*`).join(', ')}`

  if (!bids || bids.length === 0) {
    await sendWhatsAppMessage(phone, `*Your Bids*\n${header}\n\nNo bids yet. Type \`bid\` to start.`)
    return
  }

  let message = `*Your Bids*\n${header}\n\n`

  for (const bid of bids) {
    const statusEmoji = bid.status === 'approved' ? '👑' : bid.status === 'paid' ? '✅' : bid.status === 'pending' ? '⏳' : bid.status === 'outbid' ? '❌' : '📋'
    const bizName = names.get(bid.business_id) || ''
    message += `${statusEmoji} *${bid.category}* ${bid.city ? `in ${bid.city}` : '(nationwide)'}${mine.length > 1 && bizName ? ` — ${bizName}` : ''}\n`
    message += `  Bid: $${Number(bid.amount).toFixed(2)} (one-time) | Status: ${bid.status}\n`
    if (bid.paynow_paid_at) {
      message += `  Paid: ${fmtHarare(bid.paynow_paid_at, true)}\n`
    }
    message += '\n'
  }

  message += 'Type `bid` to place a new bid.'

  await sendWhatsAppMessage(phone, message)
}

/**
 * Handle "outbid" command - show what's needed to beat current #1,
 * for every listing the sender owns.
 */
export async function handleOutbidCommand(phone: string) {
  const supabase = getSupabase()

  const mine = await loadMyBusinesses(phone)

  if (mine.length === 0) {
    await sendWhatsAppMessage(phone, 'No business found for this WhatsApp number.')
    return
  }

  let message = `*Outbid Requirements* 🎯\n`
  let showedAny = false

  for (const business of mine) {
    const categories = business.category || []
    if (categories.length === 0) continue
    showedAny = true

    message += `\n*${business.name}* (${business.business_id})\n`

    if (business.is_remote) {
      for (const cat of categories) {
        const scope = await resolveBidScope(supabase, cat, '', true)
        if (scope.ok) {
          message += `*${cat}* (nationwide)\n`
          message += `Nationwide slot: *$${scope.min.toFixed(2)}* = $${NATIONWIDE_TOWN_FEE.toFixed(2)} × ${scope.towns} open towns\n`
          const held = await localHeldSpots(supabase, cat)
          if (held.length > 0) {
            message += `Takeovers available: ${held.slice(0, 4).map((s: { city: string; monthly_fee: number }) => `${s.city} (2× $${Number(s.monthly_fee).toFixed(2)})`).join(', ')}${held.length > 4 ? '…' : ''}\n`
          }
          message += '\n'
        } else {
          message += `*${cat}* (nationwide)\nNationwide slot closed — locals hold every town. Type \`bid\` to see takeover prices.\n\n`
        }
      }
      continue
    }

    for (const cat of categories) {
      const city = business.city || 'N/A'

      const scope = await resolveBidScope(supabase, cat, business.city || '', false)

      if (scope.ok) {
        message += `*${cat}* in ${city}\n`
        message += `Current #1: ${scope.mode === 'outbid' ? (scope.holderId === business.id ? 'YOU 👑' : 'Another business') : '*OPEN* 🟢'}\n`
        if (scope.mode === 'outbid') {
          message += `Current fee paid: $${scope.currentFee.toFixed(2)} (one-time)\n`
          message += `To take/keep #1: bid at least *$${scope.min.toFixed(2)}* (fee + $${MIN_BID_GAP.toFixed(2)})\n\n`
        } else {
          message += `Min bid: *$${scope.min.toFixed(2)}* (one-time)\n\n`
        }
      } else {
        message += `*${cat}* in ${city}\n${scope.reason}\n\n`
      }
    }
  }

  if (!showedAny) {
    await sendWhatsAppMessage(phone, 'Your listings have no categories. Add categories via the portal to bid.')
    return
  }

  message += 'Type `bid <category> <city> <amount>` for a quick bid, or `bid` for interactive.'

  await sendWhatsAppMessage(phone, message)
}
