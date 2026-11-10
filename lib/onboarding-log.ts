/**
 * Structured onboarding/registration logs.
 *
 * Every state transition, plan choice, Flow launch/fallback, trial activation
 * and payment-amount calculation writes one JSON line. Phone numbers are
 * masked and no message contents, names, addresses or payment details are
 * logged.
 *
 * Search production logs with:  [onboarding]
 */

export function maskPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length < 5) return '***'
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`
}

export function logOnboarding(event: string, fields: Record<string, unknown> = {}): void {
  try {
    console.info(
      `[onboarding] ${JSON.stringify({
        event,
        at: new Date().toISOString(),
        ...fields,
      })}`
    )
  } catch {
    // Logging must never break a user flow.
  }
}