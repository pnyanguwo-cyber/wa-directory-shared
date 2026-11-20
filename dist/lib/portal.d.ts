import type { Business } from '../types/index.js';
import { type PortalActor } from './org-auth.js';
/**
 * Session + the business the session may act on for this request.
 * * Branch / single business: always its own listing.
 * * HQ with a ?branch=<id> param: that branch, but only if it belongs to
 *   the HQ's org (resolveActingBusinessId enforces this — anything else
 *   falls back to the HQ's own listing).
 */
export declare function getActingPortalBusiness(requestedBranchId?: string | null, cookieAdapter?: {
    get(name: string): string | undefined;
}): Promise<{
    actor: PortalActor;
    business: Business;
} | null>;
/**
 * Org-wide stats for the HQ dashboard: per-listing 7-day profile views and
 * WhatsApp clicks, plus org totals. All queries are scoped by the org's
 * business ids — computed here, never from client input.
 */
export declare function getOrgDashboardStats(orgBusinesses: Business[]): Promise<{
    perBranch: Record<string, {
        views: number;
        chats: number;
    }>;
    orgTotals: {
        views: number;
        chats: number;
    };
}>;
export declare function getSubscription(businessId: string): Promise<{
    status: string;
    expiresAt: string | null;
    amount: number;
    adminNote: string;
} | null>;
export declare function isPaidSubscriber(businessId: string): Promise<boolean>;
export declare function getListingSubscription(businessId: string): Promise<{
    status: string;
    expiresAt: string | null;
    amount: number;
    payerPhone: string;
    plan: string;
    proAssistance: boolean;
} | null>;
export declare function getSupportSubscription(businessId: string): Promise<{
    tier: string;
    priceUsd: number;
    status: string;
    currentPeriodEnd: string | null;
    externalSubscriptionId: string | null;
} | null>;
export declare function getDailyStats(businessId: string, days: number | null): Promise<{
    date: any;
    type: any;
    count: number;
}[]>;
export declare function getLifetimeTotals(businessId: string): Promise<Record<string, number>>;
export declare function buildChartData(rows: {
    date: string;
    type: string;
    count: number;
}[], types: string[]): {
    date: string;
    label: string;
    values: Record<string, number>;
    total: number;
}[];
//# sourceMappingURL=portal.d.ts.map