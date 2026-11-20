import { matchCategoryAgainst, type ApprovedCategory } from './approved-data.js'

/**
 * How a typed category is allowed to become a listing category.
 *
 * The old behaviour mapped any phrase with a keyword in common onto a category
 * and filed the listing under it. "I fix phones" could land under *Phones &
 * Accessories* with no trace of the words the owner used, and no admin ever
 * saw a request. That is an assumption, not a match.
 *
 * Only three cases may be applied silently, because in each the intent is
 * unambiguous:
 *   exact     - the name itself (case/punctuation aside)
 *   typo      - one edit away from exactly one category ("plumbng")
 *   confident - the same words after dropping filler ("plumbing services")
 *
 * Everything else returns `unresolved` with a suggestion. The caller keeps the
 * owner's own words, files a category request, and lets an admin decide.
 */
export type CategoryResolution =
  | { kind: 'exact'; category: string }
  | { kind: 'typo'; category: string }
  | { kind: 'confident'; category: string }
  | { kind: 'unresolved'; suggestion: string | null }

/** Words that describe the shape of a business, not what it does. */
const FILLER = new Set([
  'service', 'services', 'work', 'works', 'shop', 'shops', 'store', 'stores',
  'business', 'businesses', 'enterprise', 'enterprises', 'company', 'co',
  'and', '&', 'the', 'we', 'i', 'do', 'does', 'sell', 'sells', 'offer',
  'offers', 'offering', 'provide', 'provides', 'providing', 'provider',
  'providers', 'solution', 'solutions', 'general', 'centre', 'center',
  'dealer', 'dealers', 'trader', 'traders', 'trading', 'supplier', 'suppliers',
])

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9& ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
}

/** Singular-insensitive token compare: "plumbers" and "Plumber" agree. */
function canonical(raw: string): string {
  return normalize(raw)
    .split(' ')
    .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ')
}

/** Core words only - filler dropped from both ends and the middle. */
function core(raw: string): string {
  return canonical(raw)
    .split(' ')
    .filter((w) => w && !FILLER.has(w))
    .join(' ')
}

/** Levenshtein, capped at 2: anything further apart is not a typo. */
function editDistance(a: string, b: string, cap = 2): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    prev = cur
  }
  return prev[b.length]
}

/** One wrong letter, one missing/extra letter, or two letters swapped. */
function isOneLetterTypo(a: string, b: string): boolean {
  if (a === b) return false
  if (editDistance(a, b, 1) <= 1) return true
  if (a.length !== b.length) return false
  const diff: number[] = []
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i)
  return (
    diff.length === 2 &&
    diff[1] === diff[0] + 1 &&
    a[diff[0]] === b[diff[1]] &&
    a[diff[1]] === b[diff[0]]
  )
}

export function resolveCategory(input: string, approved: ApprovedCategory[]): CategoryResolution {
  const raw = (input || '').trim()
  if (!raw || approved.length === 0) return { kind: 'unresolved', suggestion: null }

  const want = canonical(raw)
  const wantCore = core(raw)

  for (const c of approved) {
    if (canonical(c.name) === want) return { kind: 'exact', category: c.name }
  }

  // One edit away from exactly one category. Two candidates that close means
  // the phrase is genuinely ambiguous, so it becomes a request instead.
  const near = approved.filter((c) => {
    const name = canonical(c.name)
    return want.length >= 4 && isOneLetterTypo(want, name)
  })
  if (near.length === 1) return { kind: 'typo', category: near[0].name }

  if (wantCore) {
    // The category's own name, or one of its keywords, after predicate filler
    // is dropped: "cakes" and "plumbing services" are as certain as the name.
    const coreHits = approved.filter(
      (c) => core(c.name) === wantCore || (c.keywords || []).some((k) => core(k) === wantCore)
    )
    if (coreHits.length === 1) return { kind: 'confident', category: coreHits[0].name }

    // "solar" -> Solar Installation, but only when no other category starts
    // the same way: an ambiguous prefix is exactly the case an admin decides.
    if (wantCore.length >= 4) {
      const prefixHits = approved.filter((c) => core(c.name).startsWith(wantCore + ' '))
      if (prefixHits.length === 1) return { kind: 'confident', category: prefixHits[0].name }
    }
  }

  const suggested = matchCategoryAgainst(raw, approved)
  if (suggested !== 'Other') return { kind: 'unresolved', suggestion: suggested }

  // Nothing contained the words: nearest name or keyword, for the admin's
  // benefit only. Never applied.
  let nearest: { name: string; distance: number } | null = null
  for (const c of approved) {
    for (const candidate of [c.name, ...(c.keywords || [])]) {
      // Only close spellings: a loose "nearest" would park a solar business
      // under Baker just because it is four letters away from a keyword.
      const d = editDistance(want, core(candidate), 2)
      if (d <= 2 && (!nearest || d < nearest.distance)) nearest = { name: c.name, distance: d }
    }
  }
  return { kind: 'unresolved', suggestion: nearest?.name ?? null }
}

/**
 * What a caller should store, plus the owner's words when a human has to
 * decide. `requested` is empty when the match was safe to apply silently.
 */
export function categoryDecision(
  input: string,
  approved: ApprovedCategory[]
): { category: string; requested: string; applied: CategoryResolution['kind'] } {
  const res = resolveCategory(input, approved)
  if (res.kind !== 'unresolved') {
    return { category: res.category, requested: '', applied: res.kind }
  }
  // 'Other' rather than the suggestion: a guess shown on a public listing is
  // exactly the assumption being removed. The request carries the owner's
  // words, and approving it writes the real category onto the listing.
  return { category: 'Other', requested: input.trim(), applied: 'unresolved' }
}
