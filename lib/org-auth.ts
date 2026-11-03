import { getBusinessId, type CookieAdapterLike } from './business-auth.js'
import { getSupabase } from './supabase-server.js'
import type { Business } from '../types/index.js'
import { slugify } from './utils.js'

export type PortalActor =
  | { role: 'business'; business: Business }
  | { role: 'org-hq'; business: Business; orgId: string; orgName: string }
  | { role: 'org-branch'; business: Business; orgId: string; orgName: string }

/**
 * Resolve the logged-in session into an actor with its authority.
 * Role is derived from the DB on every request (no new token format), so
 * promoting/demoting a listing takes effect immediately without re-login.
 *
 * - No org: single-location business (today's behavior, unchanged).
 * - org member + is_hq: HQ actor with org-wide powers.
 * - org member + branch: plain branch actor (scoped to its own business id).
 */
export async function getPortalActor(cookieAdapter?: CookieAdapterLike): Promise<PortalActor | null> {
  const businessId = getBusinessId(cookieAdapter)
  if (!businessId) return null

  const { data: business } = await getSupabase()
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .maybeSingle()
  if (!business) return null

  if (!business.org_id) return { role: 'business', business: business as Business }

  const { data: org } = await getSupabase()
    .from('organizations')
    .select('id, name')
    .eq('id', business.org_id)
    .maybeSingle()
  if (!org) return { role: 'business', business: business as Business }

  if (business.is_hq) {
    return { role: 'org-hq', business: business as Business, orgId: org.id, orgName: org.name }
  }
  return { role: 'org-branch', business: business as Business, orgId: org.id, orgName: org.name }
}

/**
 * The business id the session is actually allowed to act on.
 * Branches: only ever their own id — enforced here and in every query.
 * HQ with ?branch=<id> (or body branch_id): the requested branch, but ONLY
 * if that branch belongs to the HQ's own org. Anything else falls back to
 * the HQ's own listing, never another org's branch.
 * This is the single choke point for cross-branch access.
 */
export async function resolveActingBusinessId(
  actor: PortalActor,
  requestedBranchId?: string | null
): Promise<string> {
  if (actor.role !== 'org-hq') return actor.business.id
  if (!requestedBranchId) return actor.business.id
  if (requestedBranchId === actor.business.id) return actor.business.id

  const { data } = await getSupabase()
    .from('businesses')
    .select('id')
    .eq('id', requestedBranchId)
    .eq('org_id', actor.orgId) // hard scope: same org only
    .maybeSingle()

  return data?.id || actor.business.id
}

/** All listings in the actor's org, HQ first, for dashboards/switchers. */
export async function listOrgBranches(orgId: string): Promise<Business[]> {
  const { data } = await getSupabase()
    .from('businesses')
    .select('id, name, slug, phone, city, area, is_hq, branch_label, verified, logo_url, created_at')
    .eq('org_id', orgId)
    .order('is_hq', { ascending: false })
    .order('branch_label', { ascending: true })
  return (data || []) as Business[]
}

/**
 * Org default pre-fill values for the branch-creation form.
 */
export async function getOrgDefaults(orgId: string): Promise<{
  defaultLogoUrl: string
  defaultCategories: string[]
  bioTemplate: string
  orgLogoUrl: string
}> {
  const { data } = await getSupabase()
    .from('organizations')
    .select('default_logo_url, default_categories, bio_template, logo_url')
    .eq('id', orgId)
    .maybeSingle()
  return {
    defaultLogoUrl: data?.default_logo_url || '',
    defaultCategories: data?.default_categories || [],
    bioTemplate: data?.bio_template || '',
    orgLogoUrl: data?.logo_url || '',
  }
}

/**
 * Update the org's branch pre-fill defaults (HQ only).
 */
export async function updateOrgDefaults(
  actor: PortalActor,
  defaults: { defaultLogoUrl?: string; defaultCategories?: string[]; bioTemplate?: string }
): Promise<{ error?: string }> {
  if (actor.role !== 'org-hq') return { error: 'Only the organization HQ can edit defaults' }

  const patch: Record<string, unknown> = {}
  if (defaults.defaultLogoUrl !== undefined) patch.default_logo_url = defaults.defaultLogoUrl
  if (defaults.defaultCategories !== undefined) patch.default_categories = defaults.defaultCategories
  if (defaults.bioTemplate !== undefined) patch.bio_template = defaults.bioTemplate
  if (Object.keys(patch).length === 0) return {}

  const { error } = await getSupabase()
    .from('organizations')
    .update(patch)
    .eq('id', actor.orgId)
  return error ? { error: error.message } : {}
}

/**
 * Create a branch listing owned by the HQ's organization.
 * The HQ session is the authority — no additional auth needed here.
 * Org defaults (logo, categories, bio template) pre-fill the listing;
 * explicit form values win over defaults.
 * Returns the created row and its private edit token (used to mint the
 * branch manager's account-setup invite).
 */
export async function createOrgBranch(input: {
  actor: PortalActor
  name: string
  branchLabel: string
  phone: string
  city: string
  area?: string
  category: string[]
  bio?: string
}): Promise<{ id: string; slug: string; editToken: string } | { error: string }> {
  if (input.actor.role !== 'org-hq') return { error: 'Only the organization HQ can add branches' }

  const supabase = getSupabase()

  // Org defaults (logo, categories, bio template) pre-fill the new branch.
  const { data: org } = await supabase
    .from('organizations')
    .select('name, default_logo_url, default_categories, bio_template')
    .eq('id', input.actor.orgId)
    .maybeSingle()
  const orgName = org?.name || input.actor.orgName
  const defaultLogo: string = org?.default_logo_url || ''
  const defaultCats: string[] = org?.default_categories || []
  const bioTemplate: string = org?.bio_template || ''

  // Merge categories: form selection wins; defaults fill in if the form
  // sent none (or pad a partial selection up to the 4-category cap).
  const mergedCategories = [...new Set([...input.category, ...defaultCats])].slice(0, 4)

  // Bio: explicit form bio wins; otherwise render the template with the
  // branch label; otherwise the generic fallback.
  const bio = (input.bio || '').trim() ||
    (bioTemplate ? bioTemplate.replaceAll('{branch}', input.branchLabel).trim() : '') ||
    `Official ${orgName} branch.`

  // Prevent double-creation: one open invite per org per phone.
  const fullPhone = input.phone
  const { data: dup } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('phone', fullPhone)
    .eq('org_id', input.actor.orgId)
    .maybeSingle()
  if (dup) return { error: `A branch with this number already exists: ${dup.name}` }

  const editToken = crypto.randomUUID()
  const displayName = input.branchLabel
    ? `${orgName} ${input.branchLabel}`.trim()
    : input.name.trim()

  const { data: created, error } = await supabase
    .from('businesses')
    .insert({
      name: displayName,
      slug: null, // filled below once the row id exists (mirrors schema.sql backfill)
      bio,
      category: mergedCategories,
      location: [input.area || '', input.city, 'Zimbabwe'].filter(Boolean).join(', '),
      country_code: '+263',
      city: input.city,
      area: input.area || '',
      areas: input.area ? [input.area] : [],
      phone: fullPhone,
      phone_type: 'whatsapp',
      whatsapp_link: `https://wa.me/${fullPhone}?text=${encodeURIComponent('Hi, I found you on WA Directory')}`,
      verified: false,
      rating: 0,
      review_count: 0,
      logo_url: defaultLogo || null,
      org_id: input.actor.orgId,
      is_hq: false,
      branch_label: input.branchLabel,
      edit_token: editToken,
      payment_status: 'active',
    })
    .select('id')
    .single()

  if (error || !created) return { error: error?.message || 'Could not create the branch' }

  const slug = `${slugify(displayName, 50) || 'branch'}-${created.id.slice(0, 8)}`
  await supabase.from('businesses').update({ slug }).eq('id', created.id)

  return { id: created.id, slug, editToken }
}

/**
 * Pending branch invitations across all orgs the actor's HQ owns —
 * i.e. linked branch listings that are still unverified (no admin approval,
 * so their account-setup invite is still actionable).
 */
export async function listPendingBranchInvites(orgId: string): Promise<Business[]> {
  const { data } = await getSupabase()
    .from('businesses')
    .select('id, name, slug, phone, city, branch_label, verified, created_at')
    .eq('org_id', orgId)
    .eq('is_hq', false)
    .eq('verified', false)
  return (data || []) as Business[]
}