// Tiny cross-component session sync. Login/logout flows broadcast this event
// so the navbar updates instantly without refetching on every navigation.
export const SESSION_EVENT = 'wa:session'

export function broadcastSession(loggedIn: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: { loggedIn } }))
  } catch {
    // ignore — navbar just revalidates later
  }
}

// Where to go after a successful login. Only portal paths are allowed so the
// `next` parameter can never be used as an open redirect.
export function safeNextPath(): string {
  if (typeof window === 'undefined') return '/portal'
  try {
    const next = new URLSearchParams(window.location.search).get('next')
    if (next && (next === '/portal' || next.startsWith('/portal/'))) return next
  } catch {}
  return '/portal'
}
