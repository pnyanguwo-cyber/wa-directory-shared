export interface SiteContent {
    hero: string;
    services: string;
}
export interface SiteContentGenerator {
    getCached<T>(key: string): Promise<T | null>;
    setCached(key: string, value: unknown): Promise<void>;
    callGemini(prompt: string): Promise<string | null>;
}
export declare function generateSiteContent(input: {
    businessName: string;
    category: string;
    bio: string;
    city: string;
}, gen?: SiteContentGenerator): Promise<SiteContent>;
//# sourceMappingURL=site-generation.d.ts.map