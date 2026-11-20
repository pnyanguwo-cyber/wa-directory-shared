export type SupplyOrderStatus = 'open' | 'sent' | 'claimed' | 'closed';
export interface SupplyOrderLine {
    name: string;
    qty: number;
    price: number | null;
}
export interface SupplyOrderRow {
    id: number;
    group_id: string;
    token: string;
    biz_id: string | null;
    biz_name: string;
    buyer_phone: string;
    lines: SupplyOrderLine[];
    note: string;
    city: string;
    status: SupplyOrderStatus;
    clicks: number;
    pushed_via: string;
    trace: Record<string, unknown>[];
    created_at: string;
    closed_at: string | null;
}
export declare const SUPPLY_TTL_HOURS = 24;
/** Create one supplier slice. Retries on the (rare) token collision. */
export declare function createSupplyOrder(fields: {
    group_id?: string;
    biz_id?: string | null;
    biz_name: string;
    buyer_phone: string;
    lines: SupplyOrderLine[];
    note?: string;
    city?: string;
    pushed_via?: string;
}): Promise<SupplyOrderRow | null>;
export declare function getOrderByToken(token: string): Promise<SupplyOrderRow | null>;
export declare function getSupplyOrderById(id: number): Promise<SupplyOrderRow | null>;
/** wa.me short link opened: count it and promote open → sent (never demote). */
export declare function recordOrderOpen(token: string): Promise<SupplyOrderRow | null>;
/** Supplier accepted / contacted the buyer: claimed is sticky. */
export declare function claimSupplyOrder(id: number): Promise<SupplyOrderRow | null>;
/** Open orders owed by one supplier, newest first. */
export declare function listOrdersForBusiness(bizId: string, limit?: number): Promise<SupplyOrderRow[]>;
/** Open orders a buyer owns (buy-side view; claimed ones stay until TTL). */
export declare function listOrdersForBuyer(buyerPhone: string, limit?: number): Promise<SupplyOrderRow[]>;
/** TTL sweep: stale open/sent rows → closed. Returns swept count. */
export declare function sweepStaleOrders(): Promise<number>;
/** Small counters for the admin stats line. */
export declare function orderStats(sinceHours?: number): Promise<{
    orders: number;
    claimed: number;
    usd: number;
}>;
//# sourceMappingURL=orders.d.ts.map