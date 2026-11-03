// Phone normalization. Zimbabwe-first (+263 default), tolerant of every way
// locals actually type numbers:
//   0773791864        → 263773791864   (national trunk 0 dropped)
//   +263 77 379 1864  → 263773791864   (spaces/symbols ignored)
//   263773791864      → 263773791864   (already international)
//   00 263 773791864  → 263773791864   (international dial-out prefix)
const DEFAULT_COUNTRY = '263'

function stripNoise(raw: string): string {
  return raw.replace(/[^0-9]/g, '')
}

// Just the digits of any phone input — no normalization. Many checks and
// wa.me links only care about digits.
export function digitsOnly(raw: string): string {
  return (raw || '').replace(/\D/g, '')
}

// Full international digits (no '+') for a number entered alongside a
// selected country code. Used at registration/listing time.
export function toFullPhone(countryCode: string, raw: string): string {
  const cc = stripNoise(countryCode || '') || DEFAULT_COUNTRY
  let digits = stripNoise(raw || '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  // Already international with the selected country code → keep as-is.
  if (cc && digits.startsWith(cc) && digits.length > cc.length) return digits
  // Local trunk prefix (e.g. Zimbabwe's 0) → drop it.
  if (digits.startsWith('0')) digits = digits.slice(1)
  return cc + digits
}

// Canonical form for a number typed WITHOUT a country-code selector (login,
// OTP, password reset). Accepts 077…, +26377…, 26377… interchangeably.
export function canonicalPhone(raw: string): string {
  let digits = stripNoise(raw || '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith(DEFAULT_COUNTRY) && digits.length >= 11) return digits
  if (digits.startsWith('0')) digits = digits.slice(1)
  return DEFAULT_COUNTRY + digits
}

// Voice numbers (landlines & hotlines) are stored EXACTLY as entered, in
// national format — 024 2123456 stays 0242123456, 999 stays 999. Forcing
// them into +263… would corrupt them (a hotline is not dialable as
// +263999, and wa.me links are meaningless for them).
export function normalizeVoicePhone(raw: string): string {
  let digits = stripNoise(raw || '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  return digits
}
