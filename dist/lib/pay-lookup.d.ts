export interface PayBusiness {
    id: string;
    name: string;
    slug: string;
    business_id: string;
    username: string | null;
    phone: string;
    city: string;
    area: string;
    logo_url: string | null;
    category: string[];
    payment_status: string;
    match: 'business_id' | 'phone' | 'username' | 'name';
}
export declare const PAY_BUSINESS_COLUMNS = "id, name, slug, business_id, username, phone, city, area, logo_url, category, payment_status";
export declare function searchPayBusinesses(supabase: ReturnType<typeof import('./supabase-server.js').getSupabase>, query: string): Promise<PayBusiness[]>;
//# sourceMappingURL=pay-lookup.d.ts.map