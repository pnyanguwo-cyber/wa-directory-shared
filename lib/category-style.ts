import type { LucideProps } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { categories } from '../data/categories.js'
import React from 'react'

const SPECIAL = new Set(categories.filter(c => c.special).map(c => c.name))

export function isYellowPages(categories?: string[] | null): boolean {
  if (!categories || categories.length === 0) return false
  return categories.some(c => SPECIAL.has(c))
}

export const LUCIDE_DOODLES: Record<string, React.ComponentType<LucideProps>> = {
  Baker: LucideIcons.Cake,
  Plumber: LucideIcons.Wrench,
  Electrician: LucideIcons.Zap,
  'Food & Restaurant': LucideIcons.UtensilsCrossed,
  'Hair & Beauty': LucideIcons.Scissors,
  'Building Materials': LucideIcons.Hammer,
  'Clothing & Fashion': LucideIcons.Shirt,
  Automotive: LucideIcons.Car,
  'Cleaning Services': LucideIcons.SprayCan,
  'Farming & Agriculture': LucideIcons.Sprout,
  'Health & Medical': LucideIcons.Stethoscope,
  'Education & Tutoring': LucideIcons.GraduationCap,
  'IT & Web': LucideIcons.Monitor,
  'Transport & Delivery': LucideIcons.Truck,
  'Real Estate': LucideIcons.Home,
  'Financial Services': LucideIcons.Banknote,
  'Legal Services': LucideIcons.Scale,
  Photography: LucideIcons.Camera,
  Electronics: LucideIcons.Smartphone,
  'Pet Services': LucideIcons.PawPrint,
  Mining: LucideIcons.Pickaxe,
  Utilities: LucideIcons.Droplets,
  Manufacturing: LucideIcons.Factory,
  Wholesale: LucideIcons.Package,
  'Security Services': LucideIcons.Shield,
  'Funeral Services': LucideIcons.Heart,
  'Fitness & Gym': LucideIcons.Dumbbell,
  Printing: LucideIcons.Printer,
  Jewelry: LucideIcons.Gem,
  Entertainment: LucideIcons.Music,
  'Hotel & Lodging': LucideIcons.BedDouble,
  'Travel & Tourism': LucideIcons.Plane,
  Brewery: LucideIcons.Beer,
  'Professional Services': LucideIcons.Briefcase,
  'Music Studio': LucideIcons.Music,
  Translation: LucideIcons.Languages,
  Nonprofit: LucideIcons.HandHeart,
  Daycare: LucideIcons.Baby,
  'Coworking Space': LucideIcons.Building2,
  Landscaping: LucideIcons.Trees,
  'Emergency Services': LucideIcons.Siren,
  'Government Services': LucideIcons.Landmark,
  Other: LucideIcons.Sparkles,
}

export function doodleFor(categories?: string[] | null): { name: string; icon: React.ComponentType<LucideProps> } | null {
  if (!categories || categories.length === 0) return null
  for (const cat of categories) {
    const icon = LUCIDE_DOODLES[cat]
    if (icon) return { name: cat, icon }
  }
  return { name: 'Other', icon: LUCIDE_DOODLES.Other }
}

export const CATEGORY_ACCENTS: Record<string, string> = {
  Baker: '#D97706',
  Plumber: '#2563EB',
  Electrician: '#CA8A04',
  'Food & Restaurant': '#EA580C',
  'Hair & Beauty': '#DB2777',
  'Building Materials': '#A16207',
  'Clothing & Fashion': '#C026D3',
  Automotive: '#DC2626',
  'Cleaning Services': '#0284C7',
  'Farming & Agriculture': '#15803D',
  'Health & Medical': '#0D9488',
  'Education & Tutoring': '#4F46E5',
  'IT & Web': '#7C3AED',
  'Transport & Delivery': '#0E7490',
  'Real Estate': '#059669',
  'Financial Services': '#1E40AF',
  'Legal Services': '#334155',
  Photography: '#9333EA',
  Electronics: '#0891B2',
  'Pet Services': '#F97316',
  Mining: '#92400E',
  Utilities: '#0F766E',
  Manufacturing: '#52525B',
  Wholesale: '#B45309',
  'Security Services': '#1E293B',
  'Funeral Services': '#4B5563',
  'Fitness & Gym': '#E11D48',
  Printing: '#6D28D9',
  Jewelry: '#F59E0B',
  Entertainment: '#A855F7',
  'Hotel & Lodging': '#115E59',
  'Travel & Tourism': '#0EA5E9',
  Brewery: '#9A3412',
  'Professional Services': '#475569',
  'Music Studio': '#6B21A8',
  Translation: '#4338CA',
  Nonprofit: '#047857',
  Daycare: '#EC4899',
  'Coworking Space': '#3B82F6',
  Landscaping: '#16A34A',
  'Emergency Services': '#B91C1C',
  'Government Services': '#1E3A8A',
  Other: '#25D366',
}

export function accentFor(categories?: string[] | null): string {
  if (categories) {
    for (const cat of categories) {
      const accent = CATEGORY_ACCENTS[cat]
      if (accent) return accent
    }
  }
  return CATEGORY_ACCENTS.Other
}
