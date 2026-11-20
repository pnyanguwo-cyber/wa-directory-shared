import { type ApprovedCategory } from './approved-data';
export type LearnedKind = 'city' | 'area' | 'category';
export declare function normalizeLearnedRaw(raw: string): string;
export declare function lookupLearnedMapping(kind: LearnedKind, raw: string): Promise<string | null>;
export declare function learnMapping(kind: LearnedKind, raw: string, canonical: string): Promise<boolean>;
export declare function findCityLearned(text: string): Promise<string | null>;
export declare function findAreaLearned(city: string, text: string): Promise<string | null>;
export declare function matchCategoryLearned(text: string, approved: ApprovedCategory[]): Promise<string>;
//# sourceMappingURL=learned.d.ts.map