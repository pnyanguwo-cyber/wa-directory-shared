import type { StatsEventType } from '../types/index.js'

export type { StatsEventType }

export function trackEvent(
  businessId: string,
  type: StatsEventType,
  extra?: { category?: string; city?: string }
): void {
  if (!businessId || typeof window === 'undefined') return
  try {
    const payload = { business_id: businessId, type, category: extra?.category || '', city: extra?.city || '' }
    navigator.sendBeacon?.('/api/stats/event', new Blob([JSON.stringify(payload)], { type: 'application/json' }))
  } catch (e) {
    // Fallback to fetch in non-beacon environments
    fetch('/api/stats/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, type }),
      keepalive: true,
    }).catch(() => {})
  }
}