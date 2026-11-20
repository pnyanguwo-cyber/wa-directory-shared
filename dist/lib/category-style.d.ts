import type { LucideProps } from 'lucide-react';
import React from 'react';
export declare function isYellowPages(categories?: string[] | null): boolean;
export declare const LUCIDE_DOODLES: Record<string, React.ComponentType<LucideProps>>;
export declare function doodleFor(categories?: string[] | null): {
    name: string;
    icon: React.ComponentType<LucideProps>;
} | null;
export declare const CATEGORY_ACCENTS: Record<string, string>;
export declare function accentFor(categories?: string[] | null): string;
//# sourceMappingURL=category-style.d.ts.map