export interface VerifyCandidate {
    id: string;
    name: string;
    phone: string | null;
    slug: string | null;
    username: string | null;
    city: string | null;
    verified: boolean;
    payment_status: string | null;
    created_at: string;
}
export declare function findBusinessesByName(query: string, limit?: number): Promise<VerifyCandidate[]>;
export declare function bestNameSimilarity(query: string, name: string): number;
export declare function activateListingForDays(businessId: string, days: number): Promise<{
    ok: boolean;
    error?: string;
    expiresAt?: string;
}>;
export declare function notifyBusinessLive(biz: {
    name: string;
    phone: string | null;
    slug: string | null;
    id: string;
    username?: string | null;
}): Promise<void>;
//# sourceMappingURL=admin-verify.d.ts.map