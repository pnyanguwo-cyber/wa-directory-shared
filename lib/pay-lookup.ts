// Shared business lookup for the payment flow — used by both /api/pay (web
// "pay for any business" selector) and the WhatsApp bot pay flow. Strategies
// run in parallel and results are merged in a fixed priority order, each row
// tagged with the strategy that found it so richer UIs (like the web
// match-type filter) keep working.

import { isValidBusinessId } from './business-id.js'
import { usernameMatches } from './username.js'
import { digitsOnly } from './phone.js'

export interface PayBusiness {
  id: string
  name: string
  slug: string
  business_id: string
  username: string | null
  phone: string
  city: string
  area: string
  logo_url: string | null
  category: string[]
  payment_status: string
  match: 'business_id' | 'phone' | 'username' | 'name'
}

export const PAY_BUSINESS_COLUMNS =
  'id, name, slug, business_id, username, phone, city, area, logo_url, category, payment_status'

// Search for businesses by ID, username, phone, and name — see file header.
export async function searchPayBusinesses(
  supabase: ReturnType<typeof import('./supabase-server.js').getSupabase>,
  query: string
): Promise<PayBusiness[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const found = new Map<string, PayBusiness>()
  function add(rows: Array<Omit<PayBusiness, 'match'>> | null, match: PayBusiness['match']) {
    for (const row of rows || []) {
      if (!found.has(row.id)) found.set(row.id, { ...row, match })
    }
  }

  // 1. Exact business ID match + 2. phone search are conditional; all four
  // strategies are independent queries — fetch in parallel, then merge in
  // priority order (first match wins tagging).
  const idQuery = isValidBusinessId(trimmed)
    ? supabase.from('businesses').select(PAY_BUSINESS_COLUMNS).eq('business_id', trimmed).maybeSingle()
    : null
  const digits = digitsOnly(trimmed)
  const phoneQuery = digits.length >= 9
    ? supabase.from('businesses').select(PAY_BUSINESS_COLUMNS).eq('phone', digits).limit(10)
    : null
  const [idRes, phoneRes, allBizRes, nameRes] = await Promise.all([
    idQuery,
    phoneQuery,
    supabase.from('businesses').select(PAY_BUSINESS_COLUMNS).not('username', 'is', null).limit(100),
    supabase.from('businesses').select(PAY_BUSINESS_COLUMNS).ilike('name', `%${trimmed}%`).limit(10),
  ])

  if (idRes) add(idRes.data ? [idRes.data] : [], 'business_id')
  add(phoneRes?.data || null, 'phone')
  add(
    (allBizRes.data || []).filter(b => b.username && usernameMatches(trimmed, b.username)),
    'username'
  )
  add(nameRes.data, 'name')

  return Array.from(found.values())
}
