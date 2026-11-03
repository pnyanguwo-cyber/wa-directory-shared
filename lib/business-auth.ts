// Business authentication - shared by webapp and chatbot.
// Cookie handling is injected by the host (webapp uses next/headers, chatbot uses custom storage).
import { createHmac, timingSafeEqual } from 'node:crypto'
import { canonicalPhone } from './phone.js'

const COOKIE = 'business_session'

function secret(): string | null {
  return process.env.BUSINESS_AUTH_SECRET || null
}

function normalizePhone(phone: string): string {
  return '+' + canonicalPhone(phone)
}

// Accept either a full CookieAdapter or a minimal object with just get()
// This allows chatbot runtime to pass a simple cookie getter
export interface CookieAdapterLike {
  get(name: string): string | undefined
  set?(name: string, value: string, options: { httpOnly: boolean; sameSite: 'lax' | 'strict' | 'none'; secure: boolean; path: string }): void
  delete?(name: string): void
}

export function signBusinessToken(businessId: string): string {
  const s = secret()
  if (!s) throw new Error('BUSINESS_AUTH_SECRET is not set')
  const payload = `${businessId}.${Date.now() + 30 * 24 * 60 * 60 * 1000}`
  const sig = createHmac('sha256', s).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyBusinessToken(token: string): string | null {
  try {
    const s = secret()
    if (!s) return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [businessId, expiry, sig] = parts
    const expected = createHmac('sha256', s).update(`${businessId}.${expiry}`).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    if (Number(expiry) < Date.now()) return null
    return businessId
  } catch {
    return null
  }
}

export function setBusinessSession(businessId: string, cookies: CookieAdapterLike | undefined): void {
  const token = signBusinessToken(businessId)
  cookies?.set?.(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
}

export function clearBusinessSession(cookies: CookieAdapterLike | undefined): void {
  cookies?.delete?.(COOKIE)
}

export function getBusinessId(cookies: CookieAdapterLike | undefined): string | null {
  const token = cookies?.get?.(COOKIE)
  if (!token) return null
  return verifyBusinessToken(token)
}

export { normalizePhone }