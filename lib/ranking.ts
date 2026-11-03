import { getSupabase } from './supabase-server.js'
import type { Business } from '../types/index.js'

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministic weighted shuffle: businesses with fewer profile views in the
 * category are more likely to appear first. Seeded by the query so every
 * visitor of the same query sees the same order.
 */
function weightedShuffle(businesses: Business[], seedText: string, views: Map<string, number>) {
  const rng = mulberry32(hashString(seedText))
  const pool = [...businesses]
  const out: Business[] = []
  while (pool.length > 0) {
    const weights = pool.map(b => {
      const v = views.get(b.id) || 0
      return 1 / (1 + v / 100)
    })
    const total = weights.reduce((a, w) => a + w, 0)
    let r = rng() * total
    let idx = 0
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]
      if (r <= 0) {
        idx = i
        break
      }
    }
    out.push(pool[idx])
    pool.splice(idx, 1)
  }
  return out
}

/**
 * Applies paid ranking: active rank_spots for the (category, city) first
 * then a deterministic weighted shuffle with a rarely-seen boost.
 */
export async function orderSearchResults(
  businesses: Business[],
  category: string,
  city: string,
  seedText: string
): Promise<Business[]> {
  if (businesses.length === 0) return businesses

  const supabase = getSupabase()
  let spots: { business_id: string; position: number }[] | null = null

  if (city) {
    const { data } = await supabase
      .from('rank_spots')
      .select('business_id, position')
      .eq('category', category)
      .eq('city', city)
      .eq('status', 'active')
      .order('position', { ascending: true })
      .limit(3)
    spots = data
  }

  if (!spots || spots.length === 0) {
    const { data } = await supabase
      .from('rank_spots')
      .select('business_id, position')
      .eq('category', category)
      .eq('city', '')
      .eq('status', 'active')
      .order('position', { ascending: true })
      .limit(3)
    spots = data
  }

  const byId = new Map(businesses.map(b => [b.id, b]))
  const ordered: Business[] = []
  const placed = new Set<string>()

  for (const s of spots || []) {
    const b = byId.get(s.business_id)
    if (b && !placed.has(b.id)) {
      ordered.push(b)
      placed.add(b.id)
    }
  }

  const rest = businesses.filter(b => !placed.has(b.id))
  if (rest.length === 0) return ordered

  // Rarely-seen boost: pull last-30d profile views for the remaining set
  const views = new Map<string, number>()
  if (rest.length > 2) {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const { data } = await supabase
      .from('daily_stats')
      .select('business_id, count')
      .in('business_id', rest.map(b => b.id))
      .eq('type', 'profile_view')
      .gte('date', cutoff)
    for (const r of data || []) {
      views.set(r.business_id, (views.get(r.business_id) || 0) + Number(r.count))
    }
  }

  return [...ordered, ...weightedShuffle(rest, seedText, views)]
}