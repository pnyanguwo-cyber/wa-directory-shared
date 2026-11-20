export interface Category {
    name: string;
    keywords: string[];
    icon: string;
    hint?: string;
    special?: boolean;
}
export declare const categories: Category[];
export declare function matchCategory(input: string): string;
//# sourceMappingURL=categories.d.ts.map