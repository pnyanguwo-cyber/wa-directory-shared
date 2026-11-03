import { getSupabase } from './supabase-server.js'
import crypto from 'node:crypto'

// ── S18.2 supply_orders storage ────────────────────────────────────────────
// One row per supplier slice of a typed customer order. Rows double as the
// sale tracker: open → sent (short link opened) → claimed (supplier acted) →
// closed (TTL sweep). Server-side only; fails soft where safe.

export type SupplyOrderStatus = 'open' | 'sent' | 'claimed' | 'closed'

export interface SupplyOrderLine {
  name: string
  qty: number
  price: number | null
}

export interface SupplyOrderRow {
  id: number
  group_id: string
  token: string
  biz_id: string | null
  biz_name: string
  buyer_phone: string
  lines: SupplyOrderLine[]
  note: string
  city: string
  status: SupplyOrderStatus
  clicks: number
  pushed_via: string
  trace: Record<string, unknown>[]
  created_at: string
  closed_at: string | null
}

export const SUPPLY_TTL_HOURS = 24

const SUPPLY_COLUMNS =
  'id, group_id, token, biz_id, biz_name, buyer_phone, lines, note, city, status, clicks, pushed_via, trace, created_at, closed_at'

function drawToken(): string {
  // 6 chars from the unambiguous base32-ish alphabet (no 0/O/1/L/I).
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
  let out = ''
  for (let i = 0; i < 6; i++) out += alphabet[crypto.randomInt(alphabet.length)]
  return out
}

/** Create one supplier slice. Retries on the (rare) token collision. */
export async function createSupplyOrder(fields: {
  group_id?: string
  biz_id?: string | null
  biz_name: string
  buyer_phone: string
  lines: SupplyOrderLine[]
  note?: string
  city?: string
  pushed_via?: string
}): Promise<SupplyOrderRow | null> {
  const sb = getSupabase()
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await sb
      .from('supply_orders')
      .insert({
        group_id: fields.group_id || '',
        token: drawToken(),
        biz_id: fields.biz_id || null,
        biz_name: fields.biz_name,
        buyer_phone: fields.buyer_phone,
        lines: fields.lines,
        note: fields.note || '',
        city: fields.city || '',
        pushed_via: fields.pushed_via || '',
        trace: [],
      })
      .select(SUPPLY_COLUMNS)
      .maybeSingle()
    if (!error && data) return data as SupplyOrderRow
    // 23505 = unique violation on token — redraw and retry.
    if (error && !String(error.message).includes('duplicate key')) {
      console.error('[supply-orders] insert failed:', error.message)
      return null
    }
  }
  return null
}

export async function getOrderByToken(token: string): Promise<SupplyOrderRow | null> {
  const { data } = await getSupabase()
    .from('supply_orders')
    .select(SUPPLY_COLUMNS)
    .eq('token', token)
    .maybeSingle()
  return (data as SupplyOrderRow) || null
}

export async function getSupplyOrderById(id: number): Promise<SupplyOrderRow | null> {
  const { data } = await getSupabase()
    .from('supply_orders')
    .select(SUPPLY_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  return (data as SupplyOrderRow) || null
}

/** wa.me short link opened: count it and promote open → sent (never demote). */
export async function recordOrderOpen(token: string): Promise<SupplyOrderRow | null> {
  const row = await getOrderByToken(token)
  if (!row) return null
  const next: Partial<SupplyOrderRow> = {
    clicks: (row.clicks || 0) + 1,
    trace: [...(row.trace || []), { event: 'opened', at: new Date().toISOString() }],
  }
  if (row.status === 'open') next.status = 'sent'
  const { data, error } = await getSupabase()
    .from('supply_orders')
    .update(next)
    .eq('id', row.id)
    .select(SUPPLY_COLUMNS)
    .maybeSingle()
  if (error) {
    console.error('[supply-orders] open update failed:', error.message)
    return row
  }
  return (data as SupplyOrderRow) || row
}

/** Supplier accepted / contacted the buyer: claimed is sticky. */
export async function claimSupplyOrder(id: number): Promise<SupplyOrderRow | null> {
  const { data } = await getSupabase()
    .from('supply_orders')
    .update({
      status: 'claimed' as SupplyOrderStatus,
      closed_at: null,
      trace: [{ event: 'claimed', at: new Date().toISOString() }],
    })
    .eq('id', id)
    .in('status', ['open', 'sent'])
    .select(SUPPLY_COLUMNS)
    .maybeSingle()
  return (data as SupplyOrderRow) || null
}

/** Open orders owed by one supplier, newest first. */
export async function listOrdersForBusiness(bizId: string, limit = 5): Promise<SupplyOrderRow[]> {
  const { data } = await getSupabase()
    .from('supply_orders')
    .select(SUPPLY_COLUMNS)
    .eq('biz_id', bizId)
    .in('status', ['open', 'sent'])
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data as SupplyOrderRow[]) || []
}

/** Open orders a buyer owns (buy-side view; claimed ones stay until TTL). */
export async function listOrdersForBuyer(buyerPhone: string, limit = 5): Promise<SupplyOrderRow[]> {
  const { data } = await getSupabase()
    .from('supply_orders')
    .select(SUPPLY_COLUMNS)
    .eq('buyer_phone', buyerPhone)
    .in('status', ['open', 'sent', 'claimed'])
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data as SupplyOrderRow[]) || []
}

/** TTL sweep: stale open/sent rows → closed. Returns swept count. */
export async function sweepStaleOrders(): Promise<number> {
  const cutoff = new Date(Date.now() - SUPPLY_TTL_HOURS * 3600_000).toISOString()
  const { data, error } = await getSupabase()
    .from('supply_orders')
    .update({ status: 'closed' as SupplyOrderStatus, closed_at: new Date().toISOString() })
    .in('status', ['open', 'sent'])
    .lt('created_at', cutoff)
    .select('id')
  if (error) {
    console.error('[supply-orders] sweep failed:', error.message)
    return 0
  }
  return (data || []).length
}

/** Small counters for the admin stats line. */
export async function orderStats(sinceHours = 168): Promise<{ orders: number; claimed: number; usd: number }> {
  const since = new Date(Date.now() - sinceHours * 3600_000).toISOString()
  const { data } = await getSupabase()
    .from('supply_orders')
    .select('status, lines, created_at')
    .gte('created_at', since)
    .limit(500)
  const rows = (data as { status: string; lines: SupplyOrderLine[] }[]) || []
  let usd = 0
  for (const r of rows) {
    for (const l of r.lines || []) usd += (l.price || 0) * (l.qty || 0)
  }
  return {
    orders: rows.length,
    claimed: rows.filter(r => r.status === 'claimed' || r.status === 'closed').length,
    usd: Math.round(usd * 100) / 100,
  }
}
