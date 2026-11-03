// Approved categories/areas/cities - shared by webapp and chatbot.
// Caching is injected by the host (webapp uses next/cache, chatbot uses simple TTL).
import { getSupabase } from './supabase-server.js'
import { categories as staticCategories, matchCategory as staticMatch } from '../data/categories.js'
import { zimbabweCities } from '../data/zimbabwe-locations.js'

export interface ApprovedCategory {
  name: string
  icon: string
  keywords: string[]
}

export interface ApprovedArea {
  city: string
  name: string
}

export interface ApprovedCity {
  name: string
}

export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
}

// Simple in-memory cache with TTL for environments without next/cache
function createMemoryCache(): CacheAdapter {
  const store = new Map<string, { value: unknown; expiry: number }>()
  return {
    async get<T>(key: string): Promise<T | null> {
      const entry = store.get(key)
      if (!entry) return null
      if (Date.now() > entry.expiry) {
        store.delete(key)
        return null
      }
      return entry.value as T
    },
    async set(key: string, value: unknown): Promise<void> {
      store.set(key, { value, expiry: Date.now() + 5 * 60 * 1000 }) // 5 min TTL
    },
  }
}

const defaultCache = createMemoryCache()

async function fetchApprovedCategories(cache: CacheAdapter): Promise<ApprovedCategory[]> {
  const cached = await cache.get<ApprovedCategory[]>('approved-categories')
  if (cached) return cached

  try {
    const { data } = await getSupabase()
      .from('categories')
      .select('name, icon, keywords')
      .eq('active', true)
      .order('name', { ascending: true })
    if (data && data.length > 0) {
      const result = data as ApprovedCategory[]
      await cache.set('approved-categories', result)
      return result
    }
  } catch {}
  const result = staticCategories.map(c => ({ name: c.name, icon: c.icon, keywords: c.keywords }))
  await cache.set('approved-categories', result)
  return result
}

export async function getApprovedCategories(cache: CacheAdapter = defaultCache): Promise<ApprovedCategory[]> {
  return fetchApprovedCategories(cache)
}

export async function getApprovedCategoryNames(cache: CacheAdapter = defaultCache): Promise<Set<string>> {
  const rows = await getApprovedCategories(cache)
  return new Set(rows.map(r => r.name))
}

async function fetchApprovedAreas(cache: CacheAdapter): Promise<ApprovedArea[]> {
  const cached = await cache.get<ApprovedArea[]>('approved-areas')
  if (cached) return cached

  try {
    const { data } = await getSupabase()
      .from('areas')
      .select('city, name')
      .eq('active', true)
    const result = (data || []) as ApprovedArea[]
    await cache.set('approved-areas', result)
    return result
  } catch {
    const result: ApprovedArea[] = []
    await cache.set('approved-areas', result)
    return result
  }
}

export async function getApprovedAreas(cache: CacheAdapter = defaultCache): Promise<ApprovedArea[]> {
  return fetchApprovedAreas(cache)
}

export async function getApprovedAreaNames(city: string, cache: CacheAdapter = defaultCache): Promise<Set<string>> {
  const rows = await getApprovedAreas(cache)
  return new Set(rows.filter(r => r.city === city).map(r => r.name))
}

async function fetchApprovedCities(cache: CacheAdapter): Promise<ApprovedCity[]> {
  const cached = await cache.get<ApprovedCity[]>('approved-cities')
  if (cached) return cached

  const staticCityNames = new Set(zimbabweCities.map(c => c.name))
  try {
    const { data } = await getSupabase()
      .from('cities')
      .select('name')
      .eq('active', true)
      .order('name', { ascending: true })
    const dbCities = (data || []) as ApprovedCity[]
    const merged = new Map<string, ApprovedCity>()
    for (const c of dbCities) merged.set(c.name.toLowerCase(), c)
    for (const name of staticCityNames) {
      if (!merged.has(name.toLowerCase())) merged.set(name.toLowerCase(), { name })
    }
    const result = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name))
    await cache.set('approved-cities', result)
    return result
  } catch {
    const result = zimbabweCities.map(c => ({ name: c.name }))
    await cache.set('approved-cities', result)
    return result
  }
}

export async function getApprovedCities(cache: CacheAdapter = defaultCache): Promise<ApprovedCity[]> {
  return fetchApprovedCities(cache)
}

export function matchCategoryAgainst(input: string, approved: ApprovedCategory[]): string {
  const lower = input.toLowerCase().trim()
  if (!lower) return 'Other'

  for (const c of approved) {
    if (c.name.toLowerCase() === lower) return c.name
  }
  for (const c of approved) {
    if (c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())) return c.name
  }

  let bestMatch: string | null = null
  let bestScore = 0
  for (const c of approved) {
    for (const kw of c.keywords || []) {
      const kwLower = kw.toLowerCase()
      if (kwLower.includes(lower) || lower.includes(kwLower)) {
        const score = kwLower.includes(lower)
          ? kwLower.length / Math.max(lower.length, 1)
          : lower.length / Math.max(kwLower.length, 1)
        if (score > bestScore) {
          bestScore = score
          bestMatch = c.name
        }
      }
    }
  }
  if (bestMatch) return bestMatch

  const staticMatchResult = staticMatch(input)
  return staticMatchResult
}