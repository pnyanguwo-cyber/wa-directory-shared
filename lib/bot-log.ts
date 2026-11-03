import { getSupabase } from './supabase-server.js'

// ── S16 logging engines ──────────────────────────────────────────────────
// bot_messages: word-for-word bot conversation transcripts (60-day trim
// happens via the migration's prune_bot_messages(), fired from the hourly
// cron). bot_searches: one row per user search — the admin "demand radar".
// Both fail open: logging must never break or delay a bot reply.

export async function logBotMessage(phone: string, dir: 'in' | 'out', kind: string, body: string) {
  if (!phone) return
  try {
    await getSupabase().from('bot_messages').insert({
      phone,
      dir,
      kind: kind.slice(0, 20) || 'text',
      body: (body || '').slice(0, 3500),
    })
  } catch {
    // best-effort
  }
}

export async function logBotSearch(phone: string, term: string, city: string | null) {
  try {
    await getSupabase().from('bot_searches').insert({
      phone: phone || '',
      term: (term || '').slice(0, 200),
      city: city || '',
    })
  } catch {
    // best-effort
  }
}

export async function pruneBotMessages() {
  try {
    await getSupabase().rpc('prune_bot_messages')
  } catch {
    // best-effort
  }
}

/** List of callers with transcript activity in the last N days (default 14). */
export async function transcriptCallers(days = 14): Promise<{ phone: string; last_at: string; messages: number }[]> {
  try {
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const { data } = await getSupabase()
      .from('bot_messages')
      .select('phone, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000)
    const byPhone = new Map<string, { last_at: string; messages: number }>()
    for (const row of data || []) {
      const cur = byPhone.get(row.phone)
      if (cur) cur.messages++
      else byPhone.set(row.phone, { last_at: row.created_at, messages: 1 })
    }
    return [...byPhone.entries()].map(([phone, v]) => ({ phone, ...v })).slice(0, 200)
  } catch {
    return []
  }
}

/** Word-for-word conversation for one caller, oldest first. */
export async function transcriptFor(phone: string, limit = 400) {
  try {
    const { data } = await getSupabase()
      .from('bot_messages')
      .select('dir, kind, body, created_at')
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(limit)
    return (data || []).reverse()
  } catch {
    return []
  }
}
