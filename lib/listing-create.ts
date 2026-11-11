import { getSupabase } from './supabase-server.js'
import { zimbabweCities } from '../data/zimbabwe-locations.js'
import { categories as staticCategories } from '../data/categories.js'
import { getApprovedAreas, getApprovedCities, getApprovedCategories } from './approved-data.js'
import { toFullPhone, normalizeVoicePhone } from './phone.js'
import { generateBusinessId } from './business-id.js'
import { normalizeUsername, suggestUsername } from './username.js'
import { generateSiteContent } from './site-generation.js'
import { SITE_URL } from './site-url.js'
import { slugify, dedupeCategories } from './utils.js'

const SPECIAL_CATEGORIES = new Set(staticCategories.filter(c => c.special).map(c => c.name))
const WA_MSG = 'Hi%2C%20I%20found%20you%20on%20WA%20Directory'

export interface ListingInput {
  name: string
  countryCode?: string
  phone: string
  phoneType?: string
  voicePhone?: string
  categories: string[]
  city?: string
  pendingCity?: boolean
  areas?: string[]
  isRemote?: boolean
  catalogLink?: string
  logoUrl?: string
  priceRange?: string
  website?: string
  address?: string
  showLocation?: boolean
  lat?: number
  lng?: number
  addressVerified?: boolean
  generateSite?: boolean
  siteContactEmail?: string
  whatsappUsername?: string
  requestedUsername?: string
  socials?: string[]
  bio?: string
  description?: string
  notify?: boolean
}

export interface ListingResult {
  id: string
  slug: string
  name: string
  businessId: string
  username: string
  editToken: string
  categories: string[]
  city: string
  isYellowPages: boolean
  pendingPayment: boolean
}

export interface ListingError {
  error: string
}

export interface ChatbotAdapters {
  sendWhatsAppMessage: (phone: string, text: string) => Promise<void>
  sendWhatsAppTemplate?: (phone: string, template: string, vars: string[]) => Promise<void>
}

export async function createListing(
  body: Partial<ListingInput>,
  adapters?: ChatbotAdapters
): Promise<ListingResult | ListingError> {
  const { name } = body

  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
    return { error: 'A business name between 2 and 80 characters is required.' }
  }

  if (!Array.isArray(body.categories) || body.categories.length === 0 || body.categories.length > 4 ||
      !body.categories.every((c: unknown) => typeof c === 'string')) {
    return { error: 'Select at least one category.' }
  }

  if (!body.phone || typeof body.phone !== 'string') {
    return { error: 'A WhatsApp phone number is required.' }
  }
  const code = typeof body.countryCode === 'string' && body.countryCode.startsWith('+') ? body.countryCode : '+263'
  const isVoice = body.phoneType === 'voice'
  const fullPhone = isVoice ? normalizeVoicePhone(body.phone) : toFullPhone(code, body.phone)
  if (fullPhone.length < (isVoice ? 3 : 10) || fullPhone.length > 15) {
    return { error: 'That phone number looks invalid for the selected country code.' }
  }

  const validCityNames = new Set(zimbabweCities.map(c => c.name))
  const rawCityInput = typeof body.city === 'string' ? body.city : ''
  const isRemote = body.isRemote === true || rawCityInput === 'remote' || rawCityInput === '*'
  // Unknown towns are kept as "pending" locations (admin reviews them) instead
  // of being silently dropped — same treatment the web form gives custom names.
  const trimmedCity = rawCityInput.trim()
  const isPendingCity =
    !isRemote && trimmedCity.length > 0 &&
    (body.pendingCity === true || !validCityNames.has(trimmedCity))
  const cleanCity = rawCityInput
    ? (isRemote ? '' : validCityNames.has(trimmedCity) ? trimmedCity : isPendingCity ? trimmedCity : '')
    : ''

  const voicePhoneInput = typeof body.voicePhone === 'string' ? body.voicePhone.trim() : ''
  const cleanVoicePhone = voicePhoneInput && !isVoice ? normalizeVoicePhone(voicePhoneInput) : null

  const supabase = getSupabase()

  const { data: catRows } = await supabase
    .from('categories')
    .select('name')
    .eq('active', true)
  const approvedCategories = new Set((catRows || []).map((r: { name: string }) => r.name))

  const cleanCategories = dedupeCategories(body.categories)
    .filter(c => approvedCategories.has(c))
  if (cleanCategories.length === 0) {
    return { error: 'Selected categories are not on the approved list.' }
  }

  const cleanSocials = (Array.isArray(body.socials) ? body.socials : [])
    .filter((s: unknown): s is string => typeof s === 'string')
    .map((s: string) => s.trim().replace(/\s+/g, ' ').replace(/[`*_]/g, '').slice(0, 100))
    .filter(Boolean)
    .slice(0, 3)

  let cleanAreas: string[] = []
  if (Array.isArray(body.areas)) {
    cleanAreas = [...new Set(body.areas)]
      .filter((a: unknown): a is string => typeof a === 'string' && a.trim().length > 0)
      .map(a => a.trim())
      .slice(0, 8)
  }
  if (typeof body.city === 'string' && (body.city === '*' || body.city === 'remote')) cleanAreas = []
  if (isRemote && !cleanCity && typeof body.city === 'string' && body.city === '*') cleanAreas = []

  const location = isRemote && !cleanCity
    ? 'Zimbabwe'
    : [cleanAreas.join(', '), cleanCity, 'Zimbabwe'].filter(Boolean).join(', ')

  const price = typeof body.priceRange === 'string' ? body.priceRange.trim() : ''
  const normalizedPrice = price ? (price.startsWith('$') ? price : `$${price}`) : null

  const editToken = crypto.randomUUID()

  let businessId = generateBusinessId()
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await supabase
      .from('businesses')
      .select('id')
      .eq('business_id', businessId)
      .maybeSingle()
    if (!existing) break
    businessId = generateBusinessId()
  }

  let normalizedUsername = body.requestedUsername
    ? normalizeUsername(body.requestedUsername)
    : suggestUsername(name.trim())
  for (let i = 0; i < 10; i++) {
    const { data: existing } = await supabase
      .from('businesses')
      .select('id')
      .eq('username', normalizedUsername)
      .maybeSingle()
    if (!existing) break
    normalizedUsername = normalizedUsername.replace(/_\d+$/, '') + '_' + (i + 2)
  }

  let inserted: { id: string; slug: string | null } | null = null
  let lastError: string | null = null

  function generateSlug(name: string): string {
    const base = slugify(name, 50) || 'business'
    return `${base}-${Math.random().toString(36).slice(2, 8)}`
  }

  const generateSite = body.generateSite !== false
  const isYellowPages = cleanCategories.some(c => SPECIAL_CATEGORIES.has(c))

  for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
    const slug = generateSlug(name)
    const { data, error } = await supabase
      .from('businesses')
      .insert({
        name: name.trim(),
        slug,
        business_id: businessId,
        username: normalizedUsername,
        whatsapp_username: typeof body.whatsappUsername === 'string' ? body.whatsappUsername.trim() : '',
        bio: (typeof body.bio === 'string' && body.bio.trim()) ||
          `Professional ${typeof body.description === 'string' ? body.description.trim() : ''} services.`.replace('Professional  ', 'Professional '),
        category: cleanCategories,
        location,
        country_code: code,
        city: cleanCity,
        area: cleanAreas.length === 0 ? '' : cleanAreas[0],
        areas: cleanAreas,
        is_remote: isRemote,
        phone: fullPhone,
        phone_type: isVoice ? 'voice' : 'whatsapp',
        whatsapp_link: isVoice ? null : `https://wa.me/${fullPhone}?text=${WA_MSG}`,
        voice_phone: cleanVoicePhone,
        catalog_link: typeof body.catalogLink === 'string' && body.catalogLink.trim() ? body.catalogLink.trim() : null,
        logo_url: typeof body.logoUrl === 'string' && body.logoUrl.trim() ? body.logoUrl.trim() : null,
        price_range: normalizedPrice,
        website: typeof body.website === 'string' && body.website.trim() ? body.website.trim() : null,
        socials: cleanSocials,
        address: typeof body.address === 'string' ? body.address.trim() : '',
        lat: typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : null,
        lng: typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : null,
        address_verified: body.addressVerified === true,
        show_location: body.showLocation !== false,
        edit_token: editToken,
        generate_site: generateSite === true,
        site_contact_email: typeof body.siteContactEmail === 'string' && body.siteContactEmail.trim() ? body.siteContactEmail.trim() : '',
        verified: false,
        rating: 0,
        review_count: 0,
        payment_status: isYellowPages ? 'active' : 'pending',
      })
      .select('id, slug')
      .single()
    if (!error) inserted = data
    else lastError = error.message
  }

  if (!inserted) {
    return { error: lastError || 'Could not create the listing. Please try again.' }
  }

  if (generateSite) {
    try {
      const content = await generateSiteContent({
        businessName: name.trim(),
        category: cleanCategories[0] || '',
        bio: typeof body.bio === 'string' ? body.bio.trim() : '',
        city: cleanCity,
      })
      await supabase
        .from('businesses')
        .update({ site_hero: content.hero, site_services: content.services })
        .eq('id', inserted.id)
    } catch {
      // Non-blocking: the site falls back to template copy when generation fails.
    }
  }

  const siteUrl = SITE_URL
  const editLink = `${siteUrl}/edit?token=${editToken}`
  const payLink = `${siteUrl}/pay`
  const notify = body.notify !== false

  if (notify && adapters) {
    if (isYellowPages && process.env.ADMIN_WHATSAPP) {
      await adapters.sendWhatsAppMessage(
        process.env.ADMIN_WHATSAPP,
        [
          '🚨 *YELLOW PAGES SUBMISSION: VERIFY FAST*',
          '',
          'A public-service listing was just submitted and needs priority verification.',
          '',
          `Name: ${name.trim()}`,
          `Category: ${cleanCategories.join(', ')}`,
          `Location: ${location}`,
          `Phone: ${fullPhone}`,
          '',
          `Profile: ${siteUrl}/business/${inserted.slug || inserted.id}`,
          `Review: ${siteUrl}/admin`,
          '',
          'Verify ASAP so it appears in the Emergency & Essential Services strip and /yellow-pages.',
        ].join('\n')
      )
    }

    if (isYellowPages) {
      const statusText = 'received: public-service listings get priority review'
      if (adapters.sendWhatsAppTemplate && process.env.WHATSAPP_TEMPLATE_SUBMITTED) {
        await adapters.sendWhatsAppTemplate(fullPhone, process.env.WHATSAPP_TEMPLATE_SUBMITTED, [name.trim(), statusText, editLink])
      } else {
        await adapters.sendWhatsAppMessage(
          fullPhone,
          [
            `✅ *LISTING RECEIVED: ${name.trim()}*`,
            '',
            `Your listing on WA Directory is ${statusText}.`,
            '',
            'Verification status: ⏳ Pending review',
            'Public-service listings are prioritized by our team.',
            '',
            'Edit your listing anytime with your private link:',
            editLink,
            '',
            'Keep this link safe: anyone with it can edit your listing.',
          ].join('\n')
        )
      }
    } else {
      await adapters.sendWhatsAppMessage(
        fullPhone,
        [
          `✅ *LISTING CREATED: ${name.trim()}*`,
          '',
          `Business ID: ${businessId}`,
          `Username: @${normalizedUsername}`,
          '',
          `Pay USD 1 via EcoCash to go live.`,
          `Anyone can pay for you at: ${payLink}`,
          '',
          'Your listing will appear once admin confirms the payment.',
          '',
          'Edit your listing anytime with your private link:',
          editLink,
        ].join('\n')
      )
    }
  }

  return {
    id: inserted.id,
    slug: inserted.slug || '',
    name: name.trim(),
    businessId,
    username: normalizedUsername,
    editToken,
    categories: cleanCategories,
    city: cleanCity,
    isYellowPages,
    pendingPayment: !isYellowPages,
  }
}

export interface AutoRequestInput {
  categories: string[]
  city: string
  areas: string[]
}

/** After a listing is created, push admin-review requests for any location or
 * category value that is not on the approved lists — the chatbot equivalent of
 * the web form's feature requests. When a business is later verified, these
 * requests are auto-approved and the location lands in the cities/areas
 * tables for future users. Returns human-readable labels of what was newly
 * requested (empty when everything was already approved). */
export async function autoRequestUnapprovedFeatures(
  businessId: string,
  input: AutoRequestInput
): Promise<string[]> {
  const supabase = getSupabase()
  const created: string[] = []

  const push = async (type: 'category' | 'city' | 'area', name: string, city: string, label: string) => {
    const clean = name.trim().slice(0, 60)
    if (!clean) return
    const { data: existing } = await supabase
      .from('feature_requests')
      .select('id, status')
      .eq('business_id', businessId)
      .eq('type', type)
      .ilike('name', clean)
      .maybeSingle()
    if (existing) return
    const { error } = await supabase
      .from('feature_requests')
      .insert({ type, name: clean, city, business_id: businessId, status: 'pending' })
    if (!error) created.push(label)
  }

  const city = (input.city || '').trim()
  const areas = (input.areas || []).map(a => (a || '').trim()).filter(Boolean)

  if (city) {
    const approvedCities = await getApprovedCities()
    if (!approvedCities.some(c => c.name.toLowerCase() === city.toLowerCase())) {
      await push('city', city, '', `city: ${city}`)
    }
    const approvedAreas = await getApprovedAreas()
    const knownInCity = new Set(
      approvedAreas.filter(a => a.city.toLowerCase() === city.toLowerCase()).map(a => a.name.toLowerCase())
    )
    for (const area of areas) {
      if (!knownInCity.has(area.toLowerCase())) await push('area', area, city, `area: ${area} (${city})`)
    }
  } else {
    for (const area of areas) await push('area', area, city, `area: ${area}`)
  }

  const approvedCats = await getApprovedCategories()
  for (const category of input.categories || []) {
    const c = (category || '').trim()
    if (c && !approvedCats.some(x => x.name.toLowerCase() === c.toLowerCase())) {
      await push('category', c, '', `category: ${c}`)
    }
  }

  return created
}

/** Admin WhatsApp notice for newly auto-created requests (null when none). */
export function adminRequestNotice(
  businessName: string,
  businessCode: string,
  labels: string[]
): string | null {
  if (!labels.length) return null
  return [
    '🆕 *New location/category request*',
    '',
    `Business: ${businessName} (${businessCode})`,
    ...labels.map(l => `• ${l}`),
    '',
    `Review: ${SITE_URL}/admin`,
  ].join('\n')
}
