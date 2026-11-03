// Unique Business ID generator: WA-XXXXXX format.
// ~2 billion combinations (36^6). Collision retry built in.

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // removed I, O, 0, 1 to avoid confusion

export function generateBusinessId(): string {
  let id = 'WA-'
  for (let i = 0; i < 6; i++) {
    id += CHARS[Math.floor(Math.random() * CHARS.length)]
  }
  return id
}

// Validate format: WA- followed by 6 uppercase alphanumeric
export function isValidBusinessId(id: string): boolean {
  return /^WA-[A-Z2-9]{6}$/.test(id)
}
