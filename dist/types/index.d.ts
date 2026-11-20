export interface Business {
    id: string;
    name: string;
    slug: string;
    bio: string;
    category: string[];
    location: string;
    country_code?: string;
    city: string;
    area: string;
    areas?: string[];
    phone: string;
    phone_type?: 'whatsapp' | 'voice';
    voice_phone?: string | null;
    whatsapp_username?: string;
    whatsapp_link?: string;
    verified: boolean;
    rating: number;
    review_count: number;
    catalog_link?: string;
    logo_url: string;
    price_range: string;
    website?: string;
    address?: string;
    lat?: number | null;
    lng?: number | null;
    address_verified?: boolean;
    show_location?: boolean;
    is_remote?: boolean;
    featured_eligible?: boolean;
    created_at: string;
    edit_token?: string;
    business_id?: string;
    username?: string;
    payment_status?: 'unpaid' | 'pending' | 'active' | 'expired';
    listing_activated_at?: string;
    org_id?: string | null;
    is_hq?: boolean;
    branch_label?: string | null;
    generate_site?: boolean;
    site_hero?: string;
    site_services?: string;
    site_contact_email?: string;
    site_theme?: {
        header?: string;
        hero?: string;
        shop?: string;
        contact?: string;
        accent?: string;
        design?: SiteDesignKey;
        font?: SiteFontKey;
    } | null;
    site_socials?: {
        twitter?: string;
        instagram?: string;
        facebook?: string;
        linkedin?: string;
        tiktok?: string;
        youtube?: string;
    } | null;
    site_content?: SiteContentBlocks | null;
    site_cover_luminance?: number | null;
}
export interface SiteFaqEntry {
    q: string;
    a: string;
}
export interface SiteHoursEntry {
    day: string;
    open: string;
    close: string;
}
export type SiteDesignKey = 'classic' | 'maison' | 'bolt' | 'craft';
export type SiteFontKey = 'modern' | 'editorial' | 'grotesk' | 'warm';
export interface SiteContentBlocks {
    tagline?: string;
    faq?: SiteFaqEntry[];
    hours?: SiteHoursEntry[];
    gallery?: string[];
}
export interface BusinessItem {
    id: string;
    business_id: string;
    name: string;
    slug: string;
    price: number;
    image_url?: string;
    image_luminance?: number | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    business?: {
        name: string;
        slug: string;
        city?: string;
    } | null;
}
export interface Organization {
    id: string;
    name: string;
    slug: string | null;
    bio: string;
    logo_url: string;
    verified: boolean;
    created_at: string;
    default_logo_url?: string;
    default_categories?: string[];
    bio_template?: string;
}
export type PlanType = '1m' | '6m' | '12m';
export declare const PLAN_CONFIG: Record<PlanType, {
    label: string;
    months: number;
    days: number;
    price: number;
    perMonth: number;
}>;
export declare const PERSONAL_PLAN_CONFIG: Record<PlanType, {
    label: string;
    months: number;
    days: number;
    price: number;
    perMonth: number;
}>;
export declare const PRO_ASSISTANCE_PRICE = 2;
export declare const TRIAL_DAYS = 90;
export declare const TRIAL_PLAN_LABEL = "90-Day Free Trial";
export declare const TRIAL_PRICE = 0;
export type TrialStatus = 'none' | 'requested' | 'active' | 'expiring' | 'expired' | 'converted';
/** Format a USD amount the way every surface (bot, portal, admin) shows it. */
export declare function formatUsd(amount: number): string;
/** Human label + price for a business plan, derived from PLAN_CONFIG only. */
export declare function businessPlanLabel(plan: PlanType): string;
/** Human label + price for a personal-contact plan. */
export declare function personalPlanLabel(plan: PlanType): string;
export type StatsEventType = 'profile_view' | 'click_whatsapp' | 'click_call' | 'click_website' | 'impression' | 'qr_scan' | 'bot_search' | 'bot_chat_open' | 'share_bot' | 'share_web';
export type SupportTier = 'bronze' | 'silver' | 'gold';
export declare const SUPPORT_TIERS: Record<SupportTier, {
    label: string;
    price: number;
    features: string[];
}>;
//# sourceMappingURL=index.d.ts.map