// Learned matching, backed by the learned_mappings table.
// The bot resolves loose user input (typos, half-typed city/area names) first
// from this table, then from the static dataset. Only *unique* prefix or
// edit-distance resolutions are written back, so exact and substring matches
// (already deterministic) never generate writes.
// Every exported function fails soft: a missing table, missing env or a dead
// network must never crash a chat conversation.

import { zimbabweCities } from '../data/zimbabwe-locations'
import { getSupabase } from './supabase-server'

export type LearnedKind = 'city' | 'area' | 'category'

const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_LIMIT = 1000 // matches the select limit below

type LearnedRow = { raw: string; canonical: string }
type LearnedCache = { loadedAt: number; rows: Map<string, string> }

const caches = new Map<LearnedKind, LearnedCache>()

// Canonical form used for every lookup key: lowercase, punctuation replaced
// with spaces, whitespace collapsed. Area entries are scoped with
// "<city>::<text>" so the same raw text can resolve differently per city.
export function normalizeLearnedRaw(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .trim()
}

async function loadRows(kind: LearnedKind): Promise<LearnedCache | null> {
  const existing = caches.get(kind)
  if (existing && Date.now() - existing.loadedAt < CACHE_TTL_MS) return existing

  try {
    const { data, error } = await getSupabase()
      .from('learned_mappings')
      .select('raw, canonical')
      .eq('kind', kind)
      .limit(CACHE_LIMIT)

    if (error) return null

    const rows = new Map<string, string>()
    for (const row of (data ?? []) as LearnedRow[]) {
      const key = normalizeLearnedRaw(row.raw)
      if (key) rows.set(key, row.canonical)
    }

    const entry: LearnedCache = { loadedAt: Date.now(), rows }
    caches.set(kind, entry)
    return entry
  } catch {
    return null
  }
}

// Exact (normalized) lookup. Does not mutate anything.
export async function lookupLearnedMapping(
  kind: LearnedKind,
  raw: string
): Promise<string | null> {
  const key = normalizeLearnedRaw(raw)
  if (!key) return null
  const entry = await loadRows(kind)
  if (!entry) return null
  return entry.rows.get(key) ?? null
}

// Persist one mapping. Skips no-ops (raw already normalizes to canonical),
// never throws, and busts the kind's cache on success so the next lookup
// sees the new row immediately.
export async function learnMapping(
  kind: LearnedKind,
  raw: string,
  canonical: string
): Promise<boolean> {
  const key = normalizeLearnedRaw(raw)
  if (!key || !canonical || normalizeLearnedRaw(canonical) === key) return false

  try {
    const { error } = await getSupabase().rpc('record_learned', {
      p_kind: kind,
      p_raw: raw,
      p_canonical: canonical,
    })
    if (error) return false
    caches.delete(kind)
    return true
  } catch {
    return false
  }
}

function distanceCap(len: number): number {
  return Math.min(3, Math.max(1, Math.round(len * 0.25)))
}

function levenshtein(a: string, b: string): number {
  const cols = a.length
  const rowsLen = b.length
  if (!cols) return rowsLen
  if (!rowsLen) return cols

  let prev = new Array<number>(cols + 1)
  let curr = new Array<number>(cols + 1)
  for (let j = 0; j <= cols; j++) prev[j] = j

  for (let i = 1; i <= rowsLen; i++) {
    curr[0] = i
    for (let j = 1; j <= cols; j++) {
      const cost = a.charCodeAt(j - 1) === b.charCodeAt(i - 1) ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    const swap = prev
    prev = curr
    curr = swap
  }
  return prev[cols]
}

// Fuzzy resolution over a candidate list. Only returns a result when it is
// unambiguous:
//  - prefix: some token (>= 3 chars) must start the candidate name, and that
//    must match exactly one candidate; or
//  - edit distance: a unique minimum among tokens that fall within the
//    per-token cap.
// Returns null on ambiguity or no hit; the caller decides whether to learn.
function resolveFuzzy(input: string, candidates: string[]): string | null {
  const tokens = input.split(' ').filter(Boolean)
  const entries = candidates.map((name) => ({ name, norm: normalizeLearnedRaw(name) }))

  const prefixHits: string[] = []
  for (const { name, norm } of entries) {
    if (tokens.some((t) => t.length >= 3 && norm.startsWith(t))) prefixHits.push(name)
  }
  if (prefixHits.length === 1) return prefixHits[0]
  if (prefixHits.length > 1) return null

  type Score = { name: string; distance: number }
  const scored: Score[] = []
  for (const token of tokens) {
    if (token.length < 2) continue
    const cap = distanceCap(token.length)
    for (const { name, norm } of entries) {
      if (Math.abs(token.length - norm.length) > cap) continue
      const distance = levenshtein(token, norm)
      if (distance <= cap) scored.push({ name, distance })
    }
  }
  if (!scored.length) return null

  const min = Math.min(...scored.map((s) => s.distance))
  const best = scored.filter((s) => s.distance === min)
  if (best.length !== 1) return null
  return best[0].name
}

// City resolution with the same fallback order the bot used to have
// (dataset order, first substring hit wins), extended with fuzzy + learn.
export async function findCityLearned(text: string): Promise<string | null> {
  const norm = normalizeLearnedRaw(text)
  if (!norm) return null

  const learned = await lookupLearnedMapping('city', norm)
  if (learned) return learned

  const lower = text.toLowerCase().trim()
  for (const city of zimbabweCities) {
    if (normalizeLearnedRaw(city.name) === norm) return city.name
  }
  for (const city of zimbabweCities) {
    if (lower.includes(city.name.toLowerCase())) return city.name
  }

  const city = resolveFuzzy(norm, zimbabweCities.map((c) => c.name))
  if (city) {
    await learnMapping('city', norm, city)
    return city
  }
  return null
}

// Area resolution scoped to one city. Scoped key keeps per-city meanings
// separate ("cbd" in Bulawayo is not "cbd" in Harare).
export async function findAreaLearned(city: string, text: string): Promise<string | null> {
  if (!city) return null
  const normCity = normalizeLearnedRaw(city)
  if (!normCity) return null

  const normText = normalizeLearnedRaw(text)
  if (!normText) return null

  const scopedKey = `${normCity}::${normText}`
  const learned = await lookupLearnedMapping('area', scopedKey)
  if (learned) return learned

  const cityEntry = zimbabweCities.find((c) => normalizeLearnedRaw(c.name) === normCity)
  if (!cityEntry) return null

  const lower = text.toLowerCase().trim()
  for (const area of cityEntry.areas) {
    if (normalizeLearnedRaw(area) === normText) return area
  }
  for (const area of cityEntry.areas) {
    if (lower.includes(area.toLowerCase())) return area
  }

  const area = resolveFuzzy(normText, cityEntry.areas)
  if (area) {
    await learnMapping('area', scopedKey, area)
    return area
  }
  return null
}
