export declare function activateListingSubscription(supabase: NonNullable<ReturnType<typeof import('./supabase-server.js').getSupabase>>, subscriptionId: string, opts?: {
    autoConfirmed?: boolean;
}): Promise<{
    ok: boolean;
    error?: string;
    businessId?: string;
}>;
//# sourceMappingURL=listing-activation.d.ts.map