import type { SiteDesignKey, SiteFontKey } from '@/types'

// Choosable auto-website templates. `classic` is the existing flagship look
// (every current site); maison/bolt/craft are the A/B/C references.
export interface DesignPreset {
  key: SiteDesignKey
  label: string
  desc: string
  defaultFont: SiteFontKey
  // Shared geometry tokens (Tailwind classes) injected by the template.
  radiusPill: string
  radiusCard: string
  radiusTile: string
  heroVariant: 'wash' | 'editorial' | 'bold' | 'warm'
  centeredHero: boolean
  sectionRule: string
}

export const SITE_DESIGN_DEFAULT: SiteDesignKey = 'classic'

export const SITE_DESIGNS: DesignPreset[] = [
  {
    key: 'classic',
    label: 'Classic',
    desc: 'The flagship WA Directory look — wash hero, frosted tiles.',
    defaultFont: 'modern',
    radiusPill: 'rounded-2xl',
    radiusCard: 'rounded-2xl',
    radiusTile: 'rounded-3xl',
    heroVariant: 'wash',
    centeredHero: false,
    sectionRule: '',
  },
  {
    key: 'maison',
    label: 'Maison',
    desc: 'Editorial luxury — serif display, centered hero, thin rules.',
    defaultFont: 'editorial',
    radiusPill: 'rounded-full',
    radiusCard: 'rounded-lg',
    radiusTile: 'rounded-lg',
    heroVariant: 'editorial',
    centeredHero: true,
    sectionRule: 'border-t border-black/[0.08]',
  },
  {
    key: 'bolt',
    label: 'Bolt',
    desc: 'Bold conversion — huge headline, stat chips, chunky cards.',
    defaultFont: 'grotesk',
    radiusPill: 'rounded-full',
    radiusCard: 'rounded-3xl',
    radiusTile: 'rounded-2xl',
    heroVariant: 'bold',
    centeredHero: false,
    sectionRule: '',
  },
  {
    key: 'craft',
    label: 'Craft',
    desc: 'Warm market feel — photo collage hero, tilted badges, soft pills.',
    defaultFont: 'warm',
    radiusPill: 'rounded-full',
    radiusCard: 'rounded-[1.75rem]',
    radiusTile: 'rounded-2xl',
    heroVariant: 'warm',
    centeredHero: false,
    sectionRule: '',
  },
]

export function getPreset(key?: string | null): DesignPreset {
  return SITE_DESIGNS.find(d => d.key === key) || SITE_DESIGNS[0]
}

// ---- Font pairs (loaded server-side via next/font in the template) --------
export const SITE_FONTS: { key: SiteFontKey; label: string; desc: string }[] = [
  { key: 'modern', label: 'Modern Sans', desc: 'Inter — the WA Directory system look' },
  { key: 'editorial', label: 'Editorial Serif', desc: 'Playfair Display + Inter' },
  { key: 'grotesk', label: 'Grotesk', desc: 'Space Grotesk + Inter' },
  { key: 'warm', label: 'Warm Serif', desc: 'DM Serif Display + DM Sans' },
]

export const SITE_FONT_KEYS: SiteFontKey[] = SITE_FONTS.map(f => f.key)

export const SITE_DESIGN_KEYS: SiteDesignKey[] = SITE_DESIGNS.map(d => d.key)

export function getFontMeta(key?: string | null) {
  return SITE_FONTS.find(f => f.key === key) || SITE_FONTS[0]
}
