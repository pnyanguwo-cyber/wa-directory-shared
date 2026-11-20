/**
 * Admin review of category / city / area requests, usable from WhatsApp.
 *
 * The web panel already had this; an admin on the road only has WhatsApp, so
 * the same decisions are exposed here as plain functions the bot can call.
 * Approval adds the value to the approved lists and rewrites the business's
 * arrays; rejection removes the value and tells the owner why.
 */
export type FeatureRequestType = 'category' | 'city' | 'area';
export interface FeatureRequestRow {
    id: string;
    type: FeatureRequestType;
    name: string;
    city: string | null;
    business_id: string | null;
    status: string;
    created_at: string | null;
}
export interface PendingFeatureRequest extends FeatureRequestRow {
    business_name: string;
    business_phone: string | null;
    business_slug: string | null;
}
export declare function listPendingFeatureRequests(limit?: number): Promise<PendingFeatureRequest[]>;
export declare function countPendingFeatureRequests(): Promise<number>;
/**
 * Approve a request, optionally under a corrected name. Mirrors the web
 * action so the two entry points cannot drift: categories/areas/cities are
 * upserted, the business's array is rewritten, the request is closed.
 */
export declare function approveFeatureRequestById(id: string, correctedName?: string): Promise<{
    ok: boolean;
    error?: string;
    name?: string;
    type?: FeatureRequestType;
}>;
export declare function rejectFeatureRequestById(id: string): Promise<{
    ok: boolean;
    error?: string;
    name?: string;
    type?: FeatureRequestType;
}>;
/** The WhatsApp list an admin reads before approving. */
export declare function renderFeatureRequestList(rows: PendingFeatureRequest[], total: number): string;
//# sourceMappingURL=feature-requests.d.ts.map