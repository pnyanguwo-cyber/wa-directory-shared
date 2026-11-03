// General-purpose utility helpers.

/** Strip em-dashes from bio/description text, replacing them with a colon. */
export function cleanBio(text: string | null | undefined): string {
  if (!text) return ''
  return text.replace(/\s*—\s*/g, ': ')
}

/** URL-friendly slug: lowercase, non-alphanumerics → hyphens, trimmed ends. */
export function slugify(text: string, maxLength = 60): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, maxLength)
}

/** Format a price as a fixed 2-decimal dollar string ('$, null-safe). */
export function formatPrice(price: number | string | null | undefined): string {
  const n = Number(price ?? 0)
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`
}

/** First letter of up to the first two words, upper-cased. */
export function getInitials(name: string, fallback = ''): string {
  return (
    (name || '')
      .split(' ')
      .filter(Boolean)
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || fallback
  )
}

/** Clean and case-insensitively deduplicate category arrays. */
export function dedupeCategories(cats: unknown): string[] {
  if (!Array.isArray(cats)) {
    if (typeof cats === 'string' && cats.trim()) {
      return [cats.trim()]
    }
    return []
  }
  const seen = new Set<string>()
  const result: string[] = []
  for (const c of cats) {
    if (typeof c === 'string' && c.trim()) {
      const trimmed = c.trim()
      const lower = trimmed.toLowerCase()
      if (!seen.has(lower)) {
        seen.add(lower)
        result.push(trimmed)
      }
    }
  }
  return result.slice(0, 4)
}
