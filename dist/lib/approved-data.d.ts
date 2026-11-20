export interface ApprovedCategory {
    name: string;
    icon: string;
    keywords: string[];
}
export interface ApprovedArea {
    city: string;
    name: string;
}
export interface ApprovedCity {
    name: string;
}
export interface CacheAdapter {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<void>;
}
export declare function getApprovedCategories(cache?: CacheAdapter): Promise<ApprovedCategory[]>;
export declare function getApprovedCategoryNames(cache?: CacheAdapter): Promise<Set<string>>;
export declare function getApprovedAreas(cache?: CacheAdapter): Promise<ApprovedArea[]>;
export declare function getApprovedAreaNames(city: string, cache?: CacheAdapter): Promise<Set<string>>;
export declare function getApprovedCities(cache?: CacheAdapter): Promise<ApprovedCity[]>;
export declare function matchCategoryAgainst(input: string, approved: ApprovedCategory[]): string;
//# sourceMappingURL=approved-data.d.ts.map