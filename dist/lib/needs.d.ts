export interface NeedRow {
    id: number;
    rq_id: string;
    buyer_phone: string;
    item: string;
    qty: string;
    budget: string;
    city: string;
    category: string;
    status: string;
    closed_by: string | null;
    quotes_forwarded: number;
    winner_quote_id: number | null;
    created_at: string;
    updated_at: string;
}
export interface QuoteRow {
    id: number;
    need_id: number;
    supplier_phone: string;
    supplier_name: string;
    price: string;
    body: string;
    status: string;
    created_at: string;
}
export declare const QUOTE_RELAY_CAP = 5;
export declare const CEREMONY_IDLE_HOURS = 22;
export declare function createNeed(fields: {
    buyer_phone: string;
    item: string;
    qty?: string;
    budget?: string;
    city?: string;
}): Promise<NeedRow | null>;
export declare function getNeedByRqId(rqId: string): Promise<NeedRow | null>;
/** 'rq7181' | 'rq-7181' | 'RQ 7181' → 'RQ-7181'; '' when not parseable. */
export declare function canonicalRq(raw: string): string;
export declare function getNeedById(id: number): Promise<NeedRow | null>;
export declare function listRecentNeeds(limit?: number): Promise<NeedRow[]>;
export declare function listOpenNeeds(limit?: number): Promise<NeedRow[]>;
export declare function listNeedsOnDay(dayIso: string, limit?: number): Promise<NeedRow[]>;
export declare function closeNeedByRqId(rqId: string, closedBy: 'buyer' | 'admin' | 'auto', winnerQuoteId?: number | null): Promise<boolean>;
/** Store a quote and return it. Hit the cap → stored is skipped, caller is
 * told the need is quiet (5 relays is plenty of attention for any buyer). */
export declare function addNeedQuote(needId: number, supplierPhone: string, supplierName: string, price: string, body: string): Promise<{
    ok: boolean;
    atCap: boolean;
    quote: QuoteRow | null;
}>;
export declare function listNeedQuotes(needId: number, limit?: number): Promise<QuoteRow[]>;
export declare function getQuoteById(quoteId: number): Promise<QuoteRow | null>;
/** Newer events (deal asks, buyer confirmations) ride the trace JSONB. */
export declare function appendNeedTrace(needId: number, kind: string): Promise<boolean>;
export declare function needHasTrace(needId: number, kind: string): Promise<boolean>;
/** Re-open: buyer said "still open" in the deal ask; ceremony firewall resets. */
export declare function reopenNeed(needId: number): Promise<boolean>;
export declare function fmtHarare(iso: string, withDate?: boolean): string;
export interface DigestWindow {
    fromIso: string;
    toIso: string;
    error?: string;
}
/** Window for the admin's spoken forms:
 *  digest            → cursor → now
 *  digest 10:30      → today-10:30 (cross-midnight swapped) → now
 *  digest 10:30 13:00 → 10:30 → 13:00 (to < from rolls to next day) */
export declare function parseDigestWindow(args: string[], cursorIso: string): DigestWindow;
export declare function getDigestCursor(): Promise<string>;
export declare function bumpDigestCursor(iso: string): Promise<boolean>;
export declare function setPrioritySwitch(enabled: boolean, price: string): Promise<boolean>;
export declare const QUOTES_PER_SEARCH = 7;
/** The demand radar data for one window. */
export declare function searchesInWindow(fromIso: string, toIso: string, limit?: number): Promise<{
    term: any;
    city: any;
    created_at: any;
}[]>;
/** The full digest text — needs (with quote tallies) + demand radar. */
export declare function compileDigest(fromIso: string, toIso: string): Promise<string>;
/** Channel-ready tip-off post (observer never sees the buyer). */
export declare function channelPostFor(need: {
    rq_id: string;
    item: string;
    qty: string;
    budget: string;
    city: string;
}): string;
/** Paying-supplier deep link target for the dormant switch (S-later). */
export declare function prioritySwitchState(): Promise<{
    enabled: boolean;
    price: string;
}>;
/** Cheap weekly admin snapshot for the `stats` command. */
export declare function adminWeeklyStats(): Promise<string>;
//# sourceMappingURL=needs.d.ts.map