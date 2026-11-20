import { getSupabase } from './supabase-server.js'
import { sendWhatsAppMessage } from './whatsapp.js'
import { SITE_URL } from './site-url.js'

/**
 * Admin review of category / city / area requests, usable from WhatsApp.
 *
 * The web panel already had this; an admin on the road only has WhatsApp, so
 * the same decisions are exposed here as plain functions the bot can call.
 * Approval adds the value to the approved lists and rewrites the business's
 * arrays; rejection removes the value and tells the owner why.
 */
export type FeatureRequestType = 'category' | 'city' | 'area'

export interface FeatureRequestRow {
  id: string
  type: FeatureRequestType
  name: string
  city: string | null
  business_id: string | null
  status: string
  created_at: string | null
}

export interface PendingFeatureRequest extends FeatureRequestRow {
  business_name: string
  business_phone: string | null
  business_slug: string | null
}

export async function listPendingFeatureRequests(limit = 20): Promise<PendingFeatureRequest[]> {
  try {
    const { data } = await getSupabase()
      .from('feature_requests')
      .select('id, type, name, city, business_id, status, created_at, businesses(name, phone, slug)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(limit)

    return ((data || []) as Array<FeatureRequestRow & { businesses?: { name?: string; phone?: string; slug?: string } | null }>).map((r) => ({
      ...r,
      business_name: r.businesses?.name || 'unattached',
      business_phone: r.businesses?.phone || null,
      business_slug: r.businesses?.slug || null,
    }))
  } catch {
    return []
  }
}

export async function countPendingFeatureRequests(): Promise<number> {
  try {
    const { count } = await getSupabase()
      .from('feature_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    return count || 0
  } catch {
    return 0
  }
}

async function loadRequest(id: string): Promise<FeatureRequestRow | null> {
  const { data } = await getSupabase()
    .from('feature_requests')
    .select('id, type, name, city, business_id, status, created_at')
    .eq('id', id)
    .maybeSingle()
  return (data as FeatureRequestRow) || null
}

const TYPE_LABEL: Record<FeatureRequestType, string> = {
  category: 'category',
  city: 'city / town',
  area: 'area',
}

/** Tell the owner what an admin decided. Best effort: never blocks the admin. */
async function notifyOwner(req: FeatureRequestRow, line: string) {
  if (!req.business_id) return
  try {
    const { data: biz } = await getSupabase()
      .from('businesses')
      .select('phone, slug')
      .eq('id', req.business_id)
      .maybeSingle()
    if (!biz?.phone) return
    const profile = biz.slug ? `${SITE_URL}/business/${biz.slug}` : SITE_URL
    await sendWhatsAppMessage(biz.phone, `${line}\n\nYour listing: ${profile}`).catch(() => {})
  } catch {
    // best effort
  }
}

/**
 * Approve a request, optionally under a corrected name. Mirrors the web
 * action so the two entry points cannot drift: categories/areas/cities are
 * upserted, the business's array is rewritten, the request is closed.
 */
export async function approveFeatureRequestById(
  id: string,
  correctedName?: string
): Promise<{ ok: boolean; error?: string; name?: string; type?: FeatureRequestType }> {
  const req = await loadRequest(id)
  if (!req) return { ok: false, error: 'Request not found.' }
  if (req.status !== 'pending') return { ok: false, error: `Already ${req.status}.` }

  const finalName = (correctedName || '').trim() || req.name
  const supabase = getSupabase()

  if (req.type === 'category') {
    await supabase.from('categories').upsert({ name: finalName, active: true }, { onConflict: 'name' })
  } else if (req.type === 'area') {
    await supabase.from('areas').upsert({ city: req.city || '', name: finalName, active: true }, { onConflict: 'city,name' })
  } else if (req.type === 'city') {
    await supabase.from('cities').upsert({ name: finalName, active: true }, { onConflict: 'name' })
  }

  if (req.business_id) {
    const { data: biz } = await supabase
      .from('businesses')
      .select('category, areas, city, requested_category')
      .eq('id', req.business_id)
      .maybeSingle()
    if (biz) {
      if (req.type === 'city') {
        await supabase.from('businesses').update({ city: finalName }).eq('id', req.business_id)
      } else {
        const arrCol = req.type === 'category' ? 'category' : 'areas'
        const arr: string[] = req.type === 'category' ? (biz.category || []) : (biz.areas || [])
        let next = arr.map((n: string) => (n === req.name ? finalName : n))
        // A category held as 'Other' because nobody had approved the owner's
        // words: this approval IS that decision, so the placeholder goes.
        const provisional = (biz.requested_category || '').trim().toLowerCase()
        const replacesPlaceholder =
          req.type === 'category' && !!provisional && provisional === req.name.toLowerCase()
        if (replacesPlaceholder) {
          next = next.filter((n: string) => n !== 'Other')
          if (!next.includes(finalName)) next = [finalName, ...next]
        }
        await supabase
          .from('businesses')
          .update(replacesPlaceholder ? { [arrCol]: next, requested_category: '' } : { [arrCol]: next })
          .eq('id', req.business_id)
      }
    }
  }

  await supabase
    .from('feature_requests')
    .update({ status: 'approved', corrected_name: finalName === req.name ? '' : finalName })
    .eq('id', req.id)

  await notifyOwner(req, `✅ Approved: *${finalName}* is now a valid ${TYPE_LABEL[req.type]} on WA Directory.`)
  return { ok: true, name: finalName, type: req.type }
}

export async function rejectFeatureRequestById(
  id: string
): Promise<{ ok: boolean; error?: string; name?: string; type?: FeatureRequestType }> {
  const req = await loadRequest(id)
  if (!req) return { ok: false, error: 'Request not found.' }
  if (req.status !== 'pending') return { ok: false, error: `Already ${req.status}.` }

  const supabase = getSupabase()

  if (req.business_id) {
    const { data: biz } = await supabase
      .from('businesses')
      .select('category, areas, city, requested_category')
      .eq('id', req.business_id)
      .maybeSingle()
    if (biz) {
      if (req.type === 'city') {
        await supabase.from('businesses').update({ city: '' }).eq('id', req.business_id)
      } else {
        const arrCol = req.type === 'category' ? 'category' : 'areas'
        const arr: string[] = req.type === 'category' ? (biz.category || []) : (biz.areas || [])
        const next = arr.filter((n: string) => n !== req.name)
        const provisional = (biz.requested_category || '').trim().toLowerCase()
        const clearsPlaceholder = req.type === 'category' && !!provisional && provisional === req.name.toLowerCase()
        await supabase
          .from('businesses')
          .update(clearsPlaceholder ? { [arrCol]: next, requested_category: '' } : { [arrCol]: next })
          .eq('id', req.business_id)
      }
    }
  }

  await supabase.from('feature_requests').update({ status: 'rejected' }).eq('id', req.id)

  await notifyOwner(
    req,
    `Hi! We couldn't approve *"${req.name}"* as your ${TYPE_LABEL[req.type]}.\n\n` +
      'Please review your listing, or suggest a correction by contacting us.'
  )
  return { ok: true, name: req.name, type: req.type }
}

/** The WhatsApp list an admin reads before approving. */
export function renderFeatureRequestList(rows: PendingFeatureRequest[], total: number): string {
  const lines = [`🗂 *Category & location requests* (${total})`, '']
  rows.forEach((r, i) => {
    const where = r.type === 'area' && r.city ? ` · ${r.city}` : ''
    lines.push(`${i + 1}. [${r.type}] *${r.name}*${where}`)
    lines.push(`   ${r.business_name}`)
  })
  lines.push('', 'Reply *approve req 1* · *approve req 1 <correct name>* · *reject req 1*')
  return lines.join('\n')
}
