import { getBusinessId } from './business-auth.js'
import { getSupabase } from './supabase-server.js'
import type { Business, StatsEventType } from '../types/index.js'
import { getPortalActor, resolveActingBusinessId, type PortalActor } from './org-auth.js'

/**
 * Session + the business the session may act on for this request.
 * * Branch / single business: always its own listing.
 * * HQ with a ?branch=<id> param: that branch, but only if it belongs to
 *   the HQ's org (resolveActingBusinessId enforces this — anything else
 *   falls back to the HQ's own listing).
 */
export async function getActingPortalBusiness(
  requestedBranchId?: string | null,
  cookieAdapter?: { get(name: string): string | undefined }
): Promise<{ actor: PortalActor; business: Business } | null> {
  const actor = await getPortalActor(cookieAdapter)
  if (!actor) return null
  const actingId = await resolveActingBusinessId(actor, requestedBranchId)
  if (actingId === actor.business.id) return { actor, business: actor.business }
  const { data } = await getSupabase().from('businesses').select('*').eq('id', actingId).maybeSingle()
  if (!data) return { actor, business: actor.business }
  return { actor, business: data as Business }
}

/**
 * Org-wide stats for the HQ dashboard: per-listing 7-day profile views and
 * WhatsApp clicks, plus org totals. All queries are scoped by the org's
 * business ids — computed here, never from client input.
 */
export async function getOrgDashboardStats(orgBusinesses: Business[]) {
  const supabase = getSupabase()
  const ids = orgBusinesses.map(b => b.id)
  if (ids.length === 0) return { perBranch: {} as Record<string, { views: number; chats: number }>, orgTotals: { views: 0, chats: 0 } }

  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const { data } = await supabase
    .from('daily_stats')
    .select('business_id, type, count')
    .in('business_id', ids)
    .gte('date', since)
    .in('type', ['profile_view', 'click_whatsapp'])

  const perBranch: Record<string, { views: number; chats: number }> = {}
  for (const b of orgBusinesses) perBranch[b.id] = { views: 0, chats: 0 }
  let orgViews = 0
  let orgChats = 0
  for (const row of data || []) {
    const entry = perBranch[row.business_id]
    if (!entry) continue
    if (row.type === 'profile_view') {
      entry.views += Number(row.count)
      orgViews += Number(row.count)
    } else {
      entry.chats += Number(row.count)
      orgChats += Number(row.count)
    }
  }
  return { perBranch, orgTotals: { views: orgViews, chats: orgChats } }
}

export async function getSubscription(businessId: string): Promise<{
  status: string
  expiresAt: string | null
  amount: number
  adminNote: string
} | null> {
  const { data } = await getSupabase()
    .from('subscriptions')
    .select('status, expires_at, amount, admin_note')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return { status: data.status, expiresAt: data.expires_at, amount: data.amount, adminNote: data.admin_note }
}

export async function isPaidSubscriber(businessId: string): Promise<boolean> {
  const sub = await getSubscription(businessId)
  return sub?.status === 'active' && (!sub.expiresAt || new Date(sub.expiresAt) > new Date())
}

export async function getListingSubscription(businessId: string): Promise<{
  status: string
  expiresAt: string | null
  amount: number
  payerPhone: string
  plan: string
  proAssistance: boolean
} | null> {
  const { data } = await getSupabase()
    .from('listing_subscriptions')
    .select('status, expires_at, amount, payer_phone, plan, pro_assistance')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return {
    status: data.status,
    expiresAt: data.expires_at,
    amount: data.amount,
    payerPhone: data.payer_phone,
    plan: data.plan || '1m',
    proAssistance: data.pro_assistance || false,
  }
}

export async function getSupportSubscription(businessId: string): Promise<{
  tier: string
  priceUsd: number
  status: string
  currentPeriodEnd: string | null
  externalSubscriptionId: string | null
} | null> {
  const { data } = await getSupabase()
    .from('support_subscriptions')
    .select('tier, price_usd, status, current_period_end, external_subscription_id')
    .eq('biz_id', businessId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return {
    tier: data.tier,
    priceUsd: data.price_usd,
    status: data.status,
    currentPeriodEnd: data.current_period_end,
    externalSubscriptionId: data.external_subscription_id,
  }
}

export async function getDailyStats(businessId: string, days: number | null) {
  const supabase = getSupabase()
  let q = supabase
    .from('daily_stats')
    .select('date, type, count')
    .eq('business_id', businessId)
  if (days) q = q.gte('date', new Date(Date.now() - days * 86400000).toISOString().slice(0, 10))
  q = q.order('date', { ascending: true })
  const { data } = await q
  return data || []
}

export async function getLifetimeTotals(businessId: string) {
  const { data } = await getSupabase()
    .from('daily_stats')
    .select('type, count')
    .eq('business_id', businessId)
  const totals: Record<string, number> = {}
  for (const row of data || []) {
    totals[row.type] = (totals[row.type] || 0) + Number(row.count)
  }
  return totals
}

export function buildChartData(
  rows: { date: string; type: string; count: number }[],
  types: string[]
): { date: string; label: string; values: Record<string, number>; total: number }[] {
  const byDate = new Map<string, Record<string, number>>()
  for (const r of rows) {
    if (!types.includes(r.type)) continue
    if (!byDate.has(r.date)) byDate.set(r.date, {})
    byDate.get(r.date)![r.type] = (byDate.get(r.date)![r.type] || 0) + Number(r.count)
  }

  // Fill missing dates with zeros to maintain a continuous timeline
  const allDates = Array.from(byDate.keys()).sort()
  if (allDates.length === 0) return []

  const start = new Date(allDates[0])
  const end = new Date(allDates[allDates.length - 1])
  const filled: { date: string; label: string; values: Record<string, number>; total: number }[] = []

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10)
    const values = byDate.get(dateStr) || {}
    filled.push({
      date: dateStr,
      label: dateStr.slice(5),
      values,
      total: Object.keys(values).reduce((sum, k) => sum + (values[k] || 0), 0),
    })
  }

  return filled
}