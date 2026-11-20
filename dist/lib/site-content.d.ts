import type { SiteContentBlocks, SiteFaqEntry, SiteHoursEntry } from '../types/index.js';
export declare const DAYS_ORDER: string[];
export declare function parseSiteContent(raw: unknown): SiteContentBlocks;
interface SiteSectionsResult {
    tagline: string;
    faq: SiteFaqEntry[];
}
export declare function generateSiteSections(input: {
    businessName: string;
    category: string;
    bio: string;
    city: string;
}): Promise<SiteSectionsResult>;
export declare function generateSiteDesign(input: {
    businessName: string;
    category: string;
    bio: string;
    city: string;
}): Promise<{
    design: string;
    font: string;
}>;
export declare function servicesToCards(services: string): string[];
export declare function hoursRenderable(hours: SiteHoursEntry[] | undefined): boolean;
export {};
//# sourceMappingURL=site-content.d.ts.map