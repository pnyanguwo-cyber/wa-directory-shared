import { getSupabase } from './supabase-server.js';
export declare const MIN_BID_GAP = 0.5;
export declare const LOCAL_BID_BASE = 0.5;
export declare const NATIONWIDE_TOWN_FEE = 0.5;
export declare const TAKEOVER_PREMIUM = 2;
type SupabaseClient = ReturnType<typeof getSupabase>;
export type BidBusiness = {
    id: string;
    name: string;
    business_id: string | null;
    category: string[] | null;
    city: string | null;
    is_remote: boolean | null;
};
/**
 * Every listing owned by this WhatsApp number (a number can own several).
 * Ordered oldest-first so the first listing is the owner's original one.
 */
export declare function loadMyBusinesses(phone: string): Promise<BidBusiness[]>;
/** Towns (static dataset) where this category has NO active #1 spot. */
export declare function unoccupiedTownCount(supabase: SupabaseClient, category: string): Promise<number>;
/** Active #1 spots in real towns whose holder is a LOCAL (non-remote) business. */
export declare function localHeldSpots(supabase: SupabaseClient, category: string): Promise<{
    city: any;
    monthly_fee: any;
    business_id: any;
}[]>;
/**
 * Resolve the minimum bid and mode for a (category, city, isRemote) scope.
 * Single source of truth for pricing, used by the WhatsApp flow.
 */
export declare function resolveBidScope(supabase: SupabaseClient, category: string, city: string, isRemote: boolean): Promise<{
    ok: true;
    mode: 'open' | 'outbid' | 'nationwide' | 'takeover';
    min: number;
    currentFee: number;
    holderId?: string;
    towns?: number;
} | {
    ok: false;
    reason: string;
}>;
/**
 * Handle the main `bid` command.
 * Usage: `bid` or `bid <category> <city|nationwide> <amount>`
 */
export declare function handleBidCommand(phone: string, text: string): Promise<void>;
/**
 * Handle business selection when the number owns several listings.
 * Callback ID format: bid_biz_<rowId>
 */
export declare function handleBidBusinessSelection(phone: string, selectionId: string): Promise<void>;
/**
 * Handle category selection from interactive list.
 * Callback ID format: bid_cat_<rowId>__<category> (legacy: bid_cat_<category>)
 */
export declare function handleBidCategorySelection(phone: string, selectionId: string): Promise<void>;
/**
 * Handle town selection for nationwide businesses (takeover of a local-held #1).
 * Callback ID format: bid_city_<rowId>__<category>__<city>
 */
export declare function handleBidCitySelection(phone: string, selectionId: string): Promise<void>;
/**
 * Handle the nationwide-slot selection for nationwide businesses.
 * Callback ID format: bid_nationwide_<rowId>__<category>
 */
export declare function handleBidNationwideSelection(phone: string, selectionId: string): Promise<void>;
/**
 * Amount-button callback ids carry the full bid scope so a tap is
 * self-contained: bid_amt_<amount>__<rowId>__<category>__<city> (empty city =
 * nationwide). Older ids without the rowId still parse (businessId '').
 */
export declare function parseBidAmountId(id: string): {
    amount: number;
    businessId: string;
    category: string;
    city: string;
} | null;
/**
 * Handle bid amount selection.
 * Called directly with (businessId, category, city, amount) by quick bids,
 * or via the scope-carrying button id from the webhook router.
 */
export declare function handleBidAmount(phone: string, businessId: string, category: string, city: string, amount: number): Promise<void>;
/**
 * Handle bid confirmation with phone number.
 * Expected format: "confirm <amount> <phone> [<category> [in <city> | nationwide]]"
 * The listing is chosen by category when the number owns several.
 */
export declare function handleBidConfirm(phone: string, text: string): Promise<void>;
/**
 * Handle "my bids" command - show bids across all of the sender's listings.
 */
export declare function handleMyBidsCommand(phone: string): Promise<void>;
/**
 * Handle "outbid" command - show what's needed to beat current #1,
 * for every listing the sender owns.
 */
export declare function handleOutbidCommand(phone: string): Promise<void>;
export {};
//# sourceMappingURL=bot-bidding.d.ts.map