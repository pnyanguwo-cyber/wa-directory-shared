/**
 * Spelling variants of a search term, ready to OR into ILIKE filters.
 * Multi-word queries swap one word at a time (plus the fully swapped
 * phrase) so "organic fertilizer" also tries "organic fertiliser".
 */
export declare function searchVariants(term: string): string[];
/** True when the text contains the term or one of its spelling variants. */
export declare function matchesSearchTerm(text: string | null | undefined, term: string): boolean;
/** Best-looking alternative spelling for display in "did you mean" copy. */
export declare function preferredVariant(term: string, haystacks: Array<string | null | undefined>): string | null;
//# sourceMappingURL=search-variants.d.ts.map