import { type CookieAdapterLike } from './business-auth.js';
import type { Business } from '../types/index.js';
export type PortalActor = {
    role: 'business';
    business: Business;
} | {
    role: 'org-hq';
    business: Business;
    orgId: string;
    orgName: string;
} | {
    role: 'org-branch';
    business: Business;
    orgId: string;
    orgName: string;
};
/**
 * Resolve the logged-in session into an actor with its authority.
 * Role is derived from the DB on every request (no new token format), so
 * promoting/demoting a listing takes effect immediately without re-login.
 *
 * - No org: single-location business (today's behavior, unchanged).
 * - org member + is_hq: HQ actor with org-wide powers.
 * - org member + branch: plain branch actor (scoped to its own business id).
 */
export declare function getPortalActor(cookieAdapter?: CookieAdapterLike): Promise<PortalActor | null>;
/**
 * The business id the session is actually allowed to act on.
 * Branches: only ever their own id — enforced here and in every query.
 * HQ with ?branch=<id> (or body branch_id): the requested branch, but ONLY
 * if that branch belongs to the HQ's own org. Anything else falls back to
 * the HQ's own listing, never another org's branch.
 * This is the single choke point for cross-branch access.
 */
export declare function resolveActingBusinessId(actor: PortalActor, requestedBranchId?: string | null): Promise<string>;
/** All listings in the actor's org, HQ first, for dashboards/switchers. */
export declare function listOrgBranches(orgId: string): Promise<Business[]>;
/**
 * Org default pre-fill values for the branch-creation form.
 */
export declare function getOrgDefaults(orgId: string): Promise<{
    defaultLogoUrl: string;
    defaultCategories: string[];
    bioTemplate: string;
    orgLogoUrl: string;
}>;
/**
 * Update the org's branch pre-fill defaults (HQ only).
 */
export declare function updateOrgDefaults(actor: PortalActor, defaults: {
    defaultLogoUrl?: string;
    defaultCategories?: string[];
    bioTemplate?: string;
}): Promise<{
    error?: string;
}>;
/**
 * Create a branch listing owned by the HQ's organization.
 * The HQ session is the authority — no additional auth needed here.
 * Org defaults (logo, categories, bio template) pre-fill the listing;
 * explicit form values win over defaults.
 * Returns the created row and its private edit token (used to mint the
 * branch manager's account-setup invite).
 */
export declare function createOrgBranch(input: {
    actor: PortalActor;
    name: string;
    branchLabel: string;
    phone: string;
    city: string;
    area?: string;
    category: string[];
    bio?: string;
}): Promise<{
    id: string;
    slug: string;
    editToken: string;
} | {
    error: string;
}>;
/**
 * Pending branch invitations across all orgs the actor's HQ owns —
 * i.e. linked branch listings that are still unverified (no admin approval,
 * so their account-setup invite is still actionable).
 */
export declare function listPendingBranchInvites(orgId: string): Promise<Business[]>;
//# sourceMappingURL=org-auth.d.ts.map