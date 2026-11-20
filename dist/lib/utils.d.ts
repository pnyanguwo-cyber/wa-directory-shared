/** Strip em-dashes from bio/description text, replacing them with a colon. */
export declare function cleanBio(text: string | null | undefined): string;
/** URL-friendly slug: lowercase, non-alphanumerics → hyphens, trimmed ends. */
export declare function slugify(text: string, maxLength?: number): string;
/** Format a price as a fixed 2-decimal dollar string ('$, null-safe). */
export declare function formatPrice(price: number | string | null | undefined): string;
/** First letter of up to the first two words, upper-cased. */
export declare function getInitials(name: string, fallback?: string): string;
/** Clean and case-insensitively deduplicate category arrays. */
export declare function dedupeCategories(cats: unknown): string[];
//# sourceMappingURL=utils.d.ts.map