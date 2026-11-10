export interface Business {
  id: string
  name: string
  slug: string
  bio: string
  category: string[]
  location: string
  country_code?: string
  city: string
  area: string
  areas?: string[]
  phone: string
  // 'whatsapp' (default) = number is WhatsApp-reachable; 'voice' = landline or
  // hotline stored in national format — renders a Call button, not wa.me.
  phone_type?: 'whatsapp' | 'voice'
  // Secondary landline/hotline shown alongside WhatsApp for both-types listings.
  voice_phone?: string | null
  whatsapp_username?: string
  whatsapp_link?: string
  verified: boolean
  rating: number
  review_count: number
  catalog_link?: string
  logo_url: string
  price_range: string
  website?: string
  address?: string
  // Google-geocoded coordinates + whether the address was map-verified.
  lat?: number | null
  lng?: number | null
  address_verified?: boolean
  show_location?: boolean
  is_remote?: boolean
  featured_eligible?: boolean
  created_at: string
  edit_token?: string
  business_id?: string
  username?: string
  payment_status?: 'unpaid' | 'pending' | 'active' | 'expired'
  listing_activated_at?: string
  // Multi-branch organizations: org_id links a listing to its umbrella org;
  // is_hq marks the HQ listing; branch_label is the branch's display name
  // (e.g. "Chinhoyi"). Null org_id = an ordinary single-location business.
  org_id?: string | null
  is_hq?: boolean
  branch_label?: string | null
  // Auto-website controls + editable site sections.
  generate_site?: boolean
  site_hero?: string
  site_services?: string
  site_contact_email?: string
  // Per-section colours for the auto-generated website.
  // Empty string / missing key = use the built-in default for that section.
  site_theme?: {
    header?: string
    hero?: string
    shop?: string
    contact?: string
    accent?: string
    // Choosable template + font pair (whitelist-validated on write).
    design?: SiteDesignKey
    font?: SiteFontKey
  } | null
  // Optional social profiles shown on the auto-generated website + profile page.
  // Empty string / missing key = the platform is not linked.
  site_socials?: {
    twitter?: string
    instagram?: string
    facebook?: string
    linkedin?: string
    tiktok?: string
    youtube?: string
  } | null
    // Structured content blocks for the flagship auto-website template.
  // All fields optional + whitelist-parsed server-side (lib/site-content.ts).
  site_content?: SiteContentBlocks | null
  // Avg luminance of site_content.gallery[0] (hero cover source). NULL =
  // unknown → default hero wash tiers.
  site_cover_luminance?: number | null
}

// FAQ / hours / gallery blocks owned via the portal Site editor.
export interface SiteFaqEntry {
  q: string
  a: string
}

export interface SiteHoursEntry {
  day: string
  // "08:00" — empty strings mean closed that day.
  open: string
  close: string
}

// Choosable auto-website templates + font pairings (lib/site-design.ts).
export type SiteDesignKey = 'classic' | 'maison' | 'bolt' | 'craft'
export type SiteFontKey = 'modern' | 'editorial' | 'grotesk' | 'warm'

export interface SiteContentBlocks {
  // Short punchy line used in the hero under the headline.
  tagline?: string
  faq?: SiteFaqEntry[]
  hours?: SiteHoursEntry[]
  // Hosted image URLs (https only, validated on write).
  gallery?: string[]
}

export interface BusinessItem {
  id: string
  business_id: string
  name: string
  slug: string
  price: number
  image_url?: string
  image_luminance?: number | null
  is_active: boolean
  created_at: string
  updated_at: string
  business?: { name: string; slug: string; city?: string } | null
}

export interface Organization {
  id: string
  name: string
  slug: string | null
  bio: string
  logo_url: string
  verified: boolean
  created_at: string
  // Pre-fill values applied to branches created by the HQ portal.
  default_logo_url?: string
  default_categories?: string[]
  bio_template?: string
}

export type PlanType = '1m' | '6m' | '12m'

export const PLAN_CONFIG: Record<PlanType, { label: string; months: number; days: number; price: number; perMonth: number }> = {
  '1m': { label: '1 Month', months: 1, days: 30, price: 2.0, perMonth: 2.0 },
  '6m': { label: '6 Months', months: 6, days: 180, price: 10.0, perMonth: 1.67 },
  '12m': { label: '12 Months', months: 12, days: 360, price: 20.0, perMonth: 1.67 },
}

// Personal-contact listings share the same durations as business packages at
// half the price: USD 1/month, USD 5 / 6 months, USD 10 / year. Same plan keys
// so listing_subscriptions.plan and activation day counts (30/180/360) carry
// over untouched; the amount override lives on the payment call.
export const PERSONAL_PLAN_CONFIG: Record<PlanType, { label: string; months: number; days: number; price: number; perMonth: number }> = {
  '1m': { label: '1 Month', months: 1, days: 30, price: 1.0, perMonth: 1.0 },
  '6m': { label: '6 Months', months: 6, days: 180, price: 5.0, perMonth: 0.83 },
  '12m': { label: '12 Months', months: 12, days: 360, price: 10.0, perMonth: 0.83 },
}

export const PRO_ASSISTANCE_PRICE = 2.0

// === Authoritative trial configuration ===
// Business listings may start with one 90-day free trial. The trial starts
// when an administrator approves/publishes the listing — never at registration
// or submission — and is a zero-amount subscription, not a discount.
export const TRIAL_DAYS = 90
export const TRIAL_PLAN_LABEL = '90-Day Free Trial'
export const TRIAL_PRICE = 0

export type TrialStatus = 'none' | 'requested' | 'active' | 'expiring' | 'expired' | 'converted'

/** Format a USD amount the way every surface (bot, portal, admin) shows it. */
export function formatUsd(amount: number): string {
  return `$${Number(amount).toFixed(2)}`
}

/** Human label + price for a business plan, derived from PLAN_CONFIG only. */
export function businessPlanLabel(plan: PlanType): string {
  const p = PLAN_CONFIG[plan]
  return `${p.label} — USD ${formatUsd(p.price)}`
}

/** Human label + price for a personal-contact plan. */
export function personalPlanLabel(plan: PlanType): string {
  const p = PERSONAL_PLAN_CONFIG[plan]
  return `${p.label} — USD ${formatUsd(p.price)}`
}

export type StatsEventType =
  | 'profile_view'
  | 'click_whatsapp'
  | 'click_call'
  | 'click_website'
  | 'impression'
  | 'qr_scan'
  | 'bot_search'
  | 'bot_chat_open'
  | 'share_bot'
  | 'share_web'

// IT Support Packages (Concierge add-on)
export type SupportTier = 'bronze' | 'silver' | 'gold'

export const SUPPORT_TIERS: Record<SupportTier, { label: string; price: number; features: string[] }> = {
  bronze: {
    label: 'Bronze',
    price: 10.0,
    features: [
      'Monthly 15-min WhatsApp check-in',
      'Profile & SEO review (quarterly)',
      'Priority email support (48h response)',
      'Auto-website content audit (quarterly)',
    ],
  },
  silver: {
    label: 'Silver',
    price: 25.0,
    features: [
      'Everything in Bronze, plus:',
      'Bi-weekly 20-min strategy call (WhatsApp/voice)',
      'WhatsApp Business catalog optimization (monthly)',
      'Competitor benchmark report (quarterly)',
      'WhatsApp template message setup & approval help',
      'Priority support (24h response)',
    ],
  },
  gold: {
    label: 'Gold',
    price: 50.0,
    features: [
      'Everything in Silver, plus:',
      'Weekly 30-min dedicated concierge session',
      'Full WhatsApp Business API configuration & maintenance',
      'Custom automation flows (catalog sync, auto-replies, labels)',
      'Monthly growth report with actionable insights',
      'Direct line to account manager (WhatsApp + email)',
      'Quarterly on-site/virtual business review',
      'Custom integration assistance (CRM, POS, etc.)',
    ],
  },
}
