import { type ApprovedCategory } from './approved-data.js';
/**
 * How a typed category is allowed to become a listing category.
 *
 * The old behaviour mapped any phrase with a keyword in common onto a category
 * and filed the listing under it. "I fix phones" could land under *Phones &
 * Accessories* with no trace of the words the owner used, and no admin ever
 * saw a request. That is an assumption, not a match.
 *
 * Only three cases may be applied silently, because in each the intent is
 * unambiguous:
 *   exact     - the name itself (case/punctuation aside)
 *   typo      - one edit away from exactly one category ("plumbng")
 *   confident - the same words after dropping filler ("plumbing services")
 *
 * Everything else returns `unresolved` with a suggestion. The caller keeps the
 * owner's own words, files a category request, and lets an admin decide.
 */
export type CategoryResolution = {
    kind: 'exact';
    category: string;
} | {
    kind: 'typo';
    category: string;
} | {
    kind: 'confident';
    category: string;
} | {
    kind: 'unresolved';
    suggestion: string | null;
};
export declare function resolveCategory(input: string, approved: ApprovedCategory[]): CategoryResolution;
/**
 * What a caller should store, plus the owner's words when a human has to
 * decide. `requested` is empty when the match was safe to apply silently.
 */
export declare function categoryDecision(input: string, approved: ApprovedCategory[]): {
    category: string;
    requested: string;
    applied: CategoryResolution['kind'];
};
//# sourceMappingURL=category-match.d.ts.map