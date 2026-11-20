"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUSINESS_PROFILE_COLUMNS = exports.BUSINESS_CARD_COLUMNS = void 0;
exports.fetchBusinessesByIds = fetchBusinessesByIds;
exports.fetchBusinessItems = fetchBusinessItems;
exports.BUSINESS_CARD_COLUMNS = 'id, name, bio, category, phone, phone_type, voice_phone, verified, rating, review_count, location, city, area, areas, slug, logo_url, price_range, created_at, address, lat, lng, address_verified, show_location, is_remote, featured_eligible';
exports.BUSINESS_PROFILE_COLUMNS = 'id, name, bio, category, phone, phone_type, voice_phone, verified, rating, review_count, location, city, area, areas, slug, logo_url, price_range, catalog_link, website, whatsapp_username, whatsapp_link, business_id, username, payment_status, created_at, address, lat, lng, address_verified, show_location, is_remote, featured_eligible,   org_id, is_hq, branch_label, generate_site, site_hero, site_services, site_contact_email, site_theme, site_socials';
// One shared "fetch these businesses by id" helper — used by the admin tables,
// cron notifications and org pages. Returns [] for an empty id list instead of
// issuing a pointless (or invalid) `.in('id', [])` query.
async function fetchBusinessesByIds(supabase, ids, columns = exports.BUSINESS_CARD_COLUMNS) {
    if (!ids.length)
        return [];
    const { data } = await supabase.from('businesses').select(columns).in('id', ids);
    return data || [];
}
// Fetches active items for a business, paginated.
// Used by the WhatsApp bot "Browse items" flow.
async function fetchBusinessItems(supabase, businessId, limit = 9, offset = 0) {
    // First get the total count for pagination
    const { count } = await supabase
        .from('business_items')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('is_active', true);
    const { data } = await supabase
        .from('business_items')
        .select('id, name, price, image_url')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    return {
        items: data || [],
        total: count || 0,
    };
}
