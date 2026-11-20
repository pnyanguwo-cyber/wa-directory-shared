import { getSupabase } from './supabase-server.js';
export declare const BUSINESS_CARD_COLUMNS = "id, name, bio, category, phone, phone_type, voice_phone, verified, rating, review_count, location, city, area, areas, slug, logo_url, price_range, created_at, address, lat, lng, address_verified, show_location, is_remote, featured_eligible";
export declare const BUSINESS_PROFILE_COLUMNS = "id, name, bio, category, phone, phone_type, voice_phone, verified, rating, review_count, location, city, area, areas, slug, logo_url, price_range, catalog_link, website, whatsapp_username, whatsapp_link, business_id, username, payment_status, created_at, address, lat, lng, address_verified, show_location, is_remote, featured_eligible,   org_id, is_hq, branch_label, generate_site, site_hero, site_services, site_contact_email, site_theme, site_socials";
export type SupabaseClient = ReturnType<typeof getSupabase>;
export declare function fetchBusinessesByIds(supabase: SupabaseClient, ids: string[], columns?: string): Promise<Record<string, unknown>[]>;
export declare function fetchBusinessItems(supabase: SupabaseClient, businessId: string, limit?: number, offset?: number): Promise<{
    items: {
        id: string;
        name: string;
        price: number;
        image_url: string | null;
    }[];
    total: number;
}>;
//# sourceMappingURL=business-select.d.ts.map