export interface ListingInput {
    name: string;
    countryCode?: string;
    phone: string;
    phoneType?: string;
    voicePhone?: string;
    /** The owner's own words for the category, kept so an admin can confirm the
     * match or turn it into a new category instead of it being silently mapped. */
    requestedCategory?: string;
    categories: string[];
    city?: string;
    pendingCity?: boolean;
    areas?: string[];
    isRemote?: boolean;
    catalogLink?: string;
    logoUrl?: string;
    priceRange?: string;
    website?: string;
    address?: string;
    showLocation?: boolean;
    lat?: number;
    lng?: number;
    addressVerified?: boolean;
    generateSite?: boolean;
    siteContactEmail?: string;
    whatsappUsername?: string;
    requestedUsername?: string;
    socials?: string[];
    bio?: string;
    description?: string;
    notify?: boolean;
}
export interface ListingResult {
    id: string;
    slug: string;
    name: string;
    businessId: string;
    username: string;
    editToken: string;
    categories: string[];
    city: string;
    isYellowPages: boolean;
    pendingPayment: boolean;
}
export interface ListingError {
    error: string;
}
export interface ChatbotAdapters {
    sendWhatsAppMessage: (phone: string, text: string) => Promise<void>;
    sendWhatsAppTemplate?: (phone: string, template: string, vars: string[]) => Promise<void>;
}
export declare function createListing(body: Partial<ListingInput>, adapters?: ChatbotAdapters): Promise<ListingResult | ListingError>;
export interface AutoRequestInput {
    categories: string[];
    city: string;
    areas: string[];
    requestedCategory?: string;
}
/** After a listing is created, push admin-review requests for any location or
 * category value that is not on the approved lists — the chatbot equivalent of
 * the web form's feature requests. When a business is later verified, these
 * requests are auto-approved and the location lands in the cities/areas
 * tables for future users. Returns human-readable labels of what was newly
 * requested (empty when everything was already approved). */
export declare function autoRequestUnapprovedFeatures(businessId: string, input: AutoRequestInput): Promise<string[]>;
/** Admin WhatsApp notice for newly auto-created requests (null when none). */
export declare function adminRequestNotice(businessName: string, businessCode: string, labels: string[]): string | null;
//# sourceMappingURL=listing-create.d.ts.map