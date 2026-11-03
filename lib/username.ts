// Username normalization and smart search matching.
// Usernames are lowercase, letters + numbers + underscores only.
// Smart search treats hyphens, spaces, and underscores as interchangeable.

// Normalize a display name into a username:
// "John's Plumbing" -> "johns_plumbing"
// "A.B.C. Enterprises" -> "abc_enterprises"
// "Harare Solar Solutions" -> "harare_solar_solutions"
export function normalizeUsername(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')  // strip special chars
    .replace(/[\s_-]+/g, '_')        // spaces, hyphens, underscores -> single underscore
    .replace(/^_+|_+$/g, '')         // trim leading/trailing underscores
    .slice(0, 30)                    // max 30 chars
}

// For smart search: normalize a search query to match usernames
// "johns-plumbing" -> "johns_plumbing"
// "Johns Plumbing" -> "johns_plumbing"
function normalizeForSearch(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// Check if a search query matches a stored username (smart match)
export function usernameMatches(query: string, storedUsername: string): boolean {
  if (!query || !storedUsername) return false
  const normalizedQuery = normalizeForSearch(query)
  const normalizedStored = normalizeForSearch(storedUsername)
  if (!normalizedQuery || !normalizedStored) return false

  // Exact match after normalization
  if (normalizedQuery === normalizedStored) return true

  // Partial match (query is a prefix of username or vice versa)
  if (normalizedStored.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalizedStored)) return true

  return false
}

// Generate a suggested username from a business name
export function suggestUsername(name: string): string {
  const normalized = normalizeUsername(name)
  if (normalized.length >= 3) return normalized
  // Pad short names
  return (normalized || 'biz') + '_biz'
}
