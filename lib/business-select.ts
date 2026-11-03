import { getSupabase } from './supabase-server.js'

export const BUSINESS_CARD_COLUMNS =
  'id, name, bio, category, phone, phone_type, voice_phone, verified, rating, review_count, location, city, area, areas, slug, logo_url, price_range, created_at, address, lat, lng, address_verified, show_location, is_remote, featured_eligible'

export const BUSINESS_PROFILE_COLUMNS =
  'id, name, bio, category, phone, phone_type, voice_phone, verified, rating, review_count, location, city, area, areas, slug, logo_url, price_range, catalog_link, website, whatsapp_username, whatsapp_link, business_id, username, payment_status, created_at, address, lat, lng, address_verified, show_location, is_remote, featured_eligible,   org_id, is_hq, branch_label, generate_site, site_hero, site_services, site_contact_email, site_theme, site_socials'

export type SupabaseClient = ReturnType<typeof getSupabase>

// One shared "fetch these businesses by id" helper — used by the admin tables,
// cron notifications and org pages. Returns [] for an empty id list instead of
// issuing a pointless (or invalid) `.in('id', [])` query.
export async function fetchBusinessesByIds(
  supabase: SupabaseClient,
  ids: string[],
  columns = BUSINESS_CARD_COLUMNS
): Promise<Record<string, unknown>[]> {
  if (!ids.length) return []
  const { data } = await supabase.from('businesses').select(columns).in('id', ids)
  return (data as unknown as Record<string, unknown>[]) || []
}

// Fetches active items for a business, paginated.
// Used by the WhatsApp bot "Browse items" flow.
export async function fetchBusinessItems(
  supabase: SupabaseClient,
  businessId: string,
  limit = 9,
  offset = 0
): Promise<{ items: { id: string; name: string; price: number; image_url: string | null }[]; total: number }> {
  // First get the total count for pagination
  const { count } = await supabase
    .from('business_items')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('is_active', true)

  const { data } = await supabase
    .from('business_items')
    .select('id, name, price, image_url')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  return {
    items: (data as { id: string; name: string; price: number; image_url: string | null }[]) || [],
    total: count || 0,
  }
}