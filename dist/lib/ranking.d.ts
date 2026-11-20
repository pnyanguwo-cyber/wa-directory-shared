import type { Business } from '../types/index.js';
/**
 * Applies paid ranking: active rank_spots for the (category, city) first
 * then a deterministic weighted shuffle with a rarely-seen boost.
 */
export declare function orderSearchResults(businesses: Business[], category: string, city: string, seedText: string): Promise<Business[]>;
//# sourceMappingURL=ranking.d.ts.map