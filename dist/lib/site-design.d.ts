import type { SiteDesignKey, SiteFontKey } from '../types/index.js';
export interface DesignPreset {
    key: SiteDesignKey;
    label: string;
    desc: string;
    defaultFont: SiteFontKey;
    radiusPill: string;
    radiusCard: string;
    radiusTile: string;
    heroVariant: 'wash' | 'editorial' | 'bold' | 'warm';
    centeredHero: boolean;
    sectionRule: string;
}
export declare const SITE_DESIGN_DEFAULT: SiteDesignKey;
export declare const SITE_DESIGNS: DesignPreset[];
export declare function getPreset(key?: string | null): DesignPreset;
export declare const SITE_FONTS: {
    key: SiteFontKey;
    label: string;
    desc: string;
}[];
export declare const SITE_FONT_KEYS: SiteFontKey[];
export declare const SITE_DESIGN_KEYS: SiteDesignKey[];
export declare function getFontMeta(key?: string | null): {
    key: SiteFontKey;
    label: string;
    desc: string;
};
//# sourceMappingURL=site-design.d.ts.map