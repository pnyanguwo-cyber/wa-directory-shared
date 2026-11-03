import { getSupabase } from './supabase-server.js'
import { getBotSetting } from './bot-settings.js'
import { sendWhatsAppMessage } from './whatsapp.js'
import { logBotMessage } from './bot-log.js'
import { digitsOnly } from './phone.js'
import { fmtHarare } from './needs.js'
import { zimbabweCities } from '../data/zimbabwe-locations.js'
import { categories } from '../data/categories.js'

// ── Casts: segmented, batched, scheduled broadcasts ───────────────────────
// Syntax (admins only):
//   cast <message>                          everyone
//   cast owners <message> / cast buyers …   owner / buyer segments
//   cast owners harare <message>            city-or-category filter
//   cast owners today 15:30 <message>       schedule (Harare time, UTC+2)
//   casts                                   recent cast list
//   cast cancel <id>                        stop a scheduled/in-flight cast
//
// Hard WhatsApp rule: free-form messages only reach contacts whose last
// inbound message is <24h old — segments narrow, never widen, that audience.
// Sends go through the bot_casts queue: the first ≤SYNC_MAX go out in the
// webhook request itself; anything more continues automatically via the
// hourly cron (CHUNK_PER_RUN), driven by an optimistic cursor guard.

export interface CastSpec {
  segment: 'all' | 'owners' | 'buyers'
  filter: string
  body: string
  scheduledFor?: string
}

export const MAX_AUDIENCE = 1000
export const SYNC_MAX_SENDS = 400
export const CHUNK_PER_RUN = 100

// ── Pure parsing ──────────────────────────────────────────────────────────

function categoryNameHits(token: string): string[] {
  const t = token.toLowerCase().replace(/[^a-z]/g, '')
  if (!t) return []
  return categories
    .filter(c =>
      c.name.toLowerCase().replace(/[^a-z]/g, '').includes(t) ||
      (c.keywords || []).some(k => k.toLowerCase().includes(t))
    )
    .map(c => c.name)
}

function isFilterToken(token: string): boolean {
  const t = token.toLowerCase().replace(/[^a-z]/g, '')
  if (!t) return false
  if (zimbabweCities.some(c => c.name.toLowerCase() === t)) return true
  if (categoryNameHits(token).length > 0) return true
  return false
}

// Harare wall-clock (today|tomorrow HH[:]MM [am|pm]) → UTC ISO. CAT is UTC+2
// with no DST, so the mapping is a fixed -2h shift.
export function scheduledForIso(when: 'today' | 'tonight' | 'tomorrow', h: number, m: number, ampm?: string): string {
  let hour = h
  if (ampm) hour = (h % 12) + (ampm.toLowerCase() === 'pm' ? 12 : 0)
  const dayStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
  let target = dayStart + (hour * 60 + m - 120) * 60000
  if (when === 'tomorrow' || target <= Date.now()) target += 24 * 3600000
  return new Date(target).toISOString()
}

export function parseCastSpec(arg: string): { spec: CastSpec | null; error?: string } {
  const arg_ = (arg || '').trim()
  if (!arg_) return { spec: null, error: 'Add a message: *cast your announcement here*.' }

  let segment: CastSpec['segment'] = 'all'
  let rest = arg_
  const segM = rest.match(/^(all|owners|buyers)\s+([\s\S]+)$/i)
  if (segM) {
    segment = segM[1].toLowerCase() as CastSpec['segment']
    rest = segM[2].trim()
  }

  let filter = ''

  // Scheduled form: today|tonight|tomorrow [+ at] HH[:]MM [am|pm] <body>.
  // Also allowed after a city/category filter token ("owners harare today 9am …").
  const TIME_ERR = 'That time looks off — use e.g. *today 15:30* or *tomorrow 9am*.'
  const trySchedule = (text: string): { spec: CastSpec; rest: string } | { badTime: true } | null => {
    const schedM = text.match(
      /^(today|tonight|tomorrow)(?:\s+at)?\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?:\s+([\s\S]+))?$/i
    )
    if (!schedM) return null
    const h = Number(schedM[2])
    const m = Number(schedM[3] || 0)
    const body = (schedM[5] || '').trim()
    if (h < 0 || h > 23 || m > 59) return { badTime: true }
    if (!body) return null
    return {
      spec: {
        segment,
        filter,
        body,
        scheduledFor: scheduledForIso(schedM[1].toLowerCase() as 'today' | 'tonight' | 'tomorrow', h, m, schedM[4]),
      },
      rest: body,
    }
  }

  const first = trySchedule(rest)
  if (first) {
    if ('badTime' in first) return { spec: null, error: TIME_ERR }
    return { spec: first.spec }
  }

  if (/^(today|tonight|tomorrow)$/i.test(rest)) {
    return { spec: null, error: 'Add a time and message: *cast owners today 15:30 <message>*.' }
  }

  // Unscheduled: an optional first token that resolves to a city or category
  // becomes the filter; anything unresolved stays part of the message.
  const tokens = rest.split(/\s+/)
  if (tokens.length >= 2 && isFilterToken(tokens[0])) {
    filter = tokens[0]
    rest = rest.slice(tokens[0].length).trim()
    const second = trySchedule(rest)
    if (second) {
      if ('badTime' in second) return { spec: null, error: TIME_ERR }
      return { spec: second.spec }
    }
  }
  if (!rest) return { spec: null, error: 'Add the message: *cast owners harare come visit our stand*.' }
  return { spec: { segment, filter, body: rest } }
}

// ── Audience resolution ───────────────────────────────────────────────────

export async function adminNumbers(): Promise<string[]> {
  const env = (process.env.ADMIN_WHATSAPP || '')
    .split(',')
    .map(p => digitsOnly(p.trim()))
    .filter(Boolean)
  let extra: string[] = []
  const raw = await getBotSetting('admin_allowlist')
  if (raw) {
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) extra = arr.map(p => digitsOnly(String(p))).filter(Boolean)
    } catch {
      // malformed allowlist — env numbers still apply
    }
  }
  return [...new Set([...env, ...extra])]
}

// Base audience: numbers with an inbound message in the last 24h (Meta
// session window open, so replies are free-form and free), minus opted-out
// contacts and bot admins.
export async function broadcastAudience(): Promise<string[]> {
  try {
    const since = new Date(Date.now() - 24 * 3600000).toISOString()
    const { data } = await getSupabase()
      .from('bot_messages')
      .select('phone')
      .eq('dir', 'in')
      .gte('created_at', since)
      .limit(2000)
    const phones = [...new Set(((data as { phone: string }[]) || []).map(r => r.phone).filter(Boolean))]
    if (!phones.length) return []
    const { data: contacts } = await getSupabase()
      .from('bot_contacts')
      .select('phone, opted_out')
      .in('phone', phones)
    const optedOut = new Set(
      ((contacts as { phone: string; opted_out: boolean }[]) || [])
        .filter(c => c.opted_out)
        .map(c => c.phone)
    )
    const admins = new Set(await adminNumbers())
    return phones.filter(p => !optedOut.has(p) && !admins.has(digitsOnly(p)))
  } catch {
    return []
  }
}

// Apply the segment on top of the base audience. Owners come from the
// businesses table (digits of `phone`); the filter token matches city or
// category text. Result capped at MAX_AUDIENCE.
export async function resolveCastAudience(spec: { segment: string; filter?: string }): Promise<string[]> {
  const base = await broadcastAudience()
  if (spec.segment === 'all' && !spec.filter) return base.slice(0, MAX_AUDIENCE)

  const { data: biz } = await getSupabase()
    .from('businesses')
    .select('phone, city, category')
  const ownerRows = ((biz as { phone: string; city: string | null; category: string | null }[]) || [])
    .filter(b => b.phone)
  const ownerDigits = ownerRows.map(b => digitsOnly(b.phone))
  const ownerSet = new Set(ownerDigits)

  if (spec.segment === 'buyers') return base.filter(p => !ownerSet.has(digitsOnly(p))).slice(0, MAX_AUDIENCE)

  // owners — with an optional city/category filter
  const f = (spec.filter || '').toLowerCase()
  const catHits = f ? categoryNameHits(f) : []
  let ownerList = ownerDigits
  if (f) {
    const wanted = new Set([...catHits.map(c => c.toLowerCase()), f])
    const filtered = ownerRows.filter(b => {
      const city = (b.city || '').toLowerCase()
      const cat = (b.category || '').toLowerCase()
      if (city.includes(f)) return true
      return [...wanted].some(w => w && cat.includes(w))
    })
    ownerList = filtered.map(b => digitsOnly(b.phone))
  }
  return base.filter(p => ownerList.includes(digitsOnly(p))).slice(0, MAX_AUDIENCE)
}

// ── Queue + sending ───────────────────────────────────────────────────────

export async function enqueueCast(
  spec: CastSpec,
  createdBy: string,
  scheduledFor: string | null,
  audience: string[]
): Promise<number | null> {
  try {
    const { data, error } = await getSupabase()
      .from('bot_casts')
      .insert({
        body: spec.body,
        segment: spec.segment,
        filter: spec.filter || '',
        status: scheduledFor ? 'scheduled' : 'sending',
        scheduled_for: scheduledFor,
        created_by: createdBy,
        audience,
      })
      .select('id')
      .single()
    if (error || !data) return null
    return Number((data as { id: number }).id)
  } catch {
    return null
  }
}

export interface CastChunkResult {
  ok: boolean
  done: boolean
  error?: string
  sent?: number
  failed?: number
  castId?: number
}

// Send one slice of a materialized cast, guarded by the cursor: the DB
// update only lands when `cursor` still equals the value this worker read,
// so a second worker (hourly cron racing the webhook, or two cron runs)
// aborts instead of double-sending or corrupting progress.
export async function sendCastChunk(castId: number, maxSends = CHUNK_PER_RUN): Promise<CastChunkResult> {
  const supabase = getSupabase()
  const { data: row } = await supabase.from('bot_casts').select('*').eq('id', castId).maybeSingle()
  if (!row) return { ok: false, done: true, error: 'cast not found', castId }
  if (row.status === 'sent' || row.status === 'cancelled' || row.status === 'failed') {
    return { ok: true, done: true, sent: row.sent_count || 0, failed: row.failed_count || 0, castId }
  }
  const audience = Array.isArray(row.audience) ? (row.audience as string[]) : []
  if (!audience.length) {
    await supabase
      .from('bot_casts')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', castId)
    return { ok: false, done: true, error: 'empty audience', castId }
  }
  // Claim scheduled → sending before the first send.
  if (row.status === 'scheduled') {
    const claim = await supabase
      .from('bot_casts')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', castId)
      .eq('status', 'scheduled')
      .select('id')
    if (!claim.data || claim.data.length === 0) {
      return { ok: true, done: false, error: 'claimed elsewhere', castId }
    }
  }

  const start = Number(row.cursor) || 0
  const slice = audience.slice(start, start + maxSends)
  let sent = 0
  let failed = 0
  for (const phone of slice) {
    try {
      await sendWhatsAppMessage(phone, row.body)
      logBotMessage(phone, 'out', 'text', row.body).catch(() => {})
      sent++
    } catch {
      failed++
    }
  }

  const next = start + slice.length
  const finished = next >= audience.length
  const patch: Record<string, unknown> = {
    cursor: next,
    sent_count: (Number(row.sent_count) || 0) + sent,
    failed_count: (Number(row.failed_count) || 0) + failed,
    updated_at: new Date().toISOString(),
  }
  if (finished) patch.status = 'sent'
  const guard = await supabase
    .from('bot_casts')
    .update(patch)
    .eq('id', castId)
    .eq('cursor', start)
    .select('id')
  if (!guard.data || guard.data.length === 0) {
    return { ok: true, done: false, error: 'advanced elsewhere', castId }
  }

  if (finished && row.created_by) {
    const segLabel =
      row.segment === 'all' ? 'everyone' : `${row.segment}${row.filter ? ` (${row.filter})` : ''}`
    const lines = [
      `📣 *Cast #${castId} delivered*`,
      `✅ Sent: ${(Number(row.sent_count) || 0) + sent}`,
      (Number(row.failed_count) || 0) + failed ? `⚠️ Failed: ${(Number(row.failed_count) || 0) + failed}` : '',
      `👥 Segment: ${segLabel}`,
    ].filter(Boolean)
    await sendWhatsAppMessage(row.created_by, lines.join('\n'))
    logBotMessage(row.created_by, 'out', 'text', lines.join('\n')).catch(() => {})
  }
  return { ok: true, done: finished, sent, failed, castId }
}

// Hourly-cron driver: drain stale in-flight casts, then release scheduled
// ones whose time has come (audience materialized at release time — the 24h
// window can only be judged then). One CHUNK_PER_RUN slice each.
export async function releaseDueCasts(): Promise<number> {
  const supabase = getSupabase()
  let advanced = 0

  const stale = new Date(Date.now() - 5 * 60000).toISOString()
  const { data: sending } = await supabase
    .from('bot_casts')
    .select('id')
    .eq('status', 'sending')
    .lt('updated_at', stale)
    .limit(10)
  for (const r of (sending as { id: number }[]) || []) {
    await sendCastChunk(r.id, CHUNK_PER_RUN)
    advanced++
  }

  const now = new Date().toISOString()
  const { data: due } = await supabase
    .from('bot_casts')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now)
    .limit(10)
  for (const r of (due as { id: number }[]) || []) {
    const { data: row } = await supabase
      .from('bot_casts')
      .select('segment, filter')
      .eq('id', r.id)
      .maybeSingle()
    if (!row) continue
    const audience = await resolveCastAudience({ segment: row.segment, filter: row.filter || '' })
    await supabase
      .from('bot_casts')
      .update({ audience, updated_at: new Date().toISOString() })
      .eq('id', r.id)
      .eq('status', 'scheduled')
    await sendCastChunk(r.id, CHUNK_PER_RUN)
    advanced++
  }
  return advanced
}

// ── Admin listing + cancel ────────────────────────────────────────────────

export async function renderCastsList(): Promise<string> {
  try {
    const { data } = await getSupabase()
      .from('bot_casts')
      .select('id, segment, filter, status, scheduled_for, sent_count, failed_count')
      .order('id', { ascending: false })
      .limit(15)
    const rows = (data as {
      id: number
      segment: string
      filter: string | null
      status: string
      scheduled_for: string | null
      sent_count: number | null
      failed_count: number | null
    }[]) || []
    if (!rows.length) {
      return 'No casts yet — start one with *cast your announcement*.'
    }
    const lines = ['📣 *Recent casts*', '']
    for (const r of rows) {
      const seg = r.segment === 'all' ? 'everyone' : `${r.segment}${r.filter ? ` ${r.filter}` : ''}`
      const when =
        r.status === 'scheduled' && r.scheduled_for
          ? `⏰ ${fmtHarare(r.scheduled_for, true)}`
          : r.status === 'sent'
            ? `✅${r.sent_count || 0}${r.failed_count ? ` ⚠️${r.failed_count}` : ''}`
            : r.status === 'sending'
              ? '⏳ sending'
              : r.status === 'failed'
                ? '❌ failed'
                : '✖️ cancelled'
      lines.push(`#${r.id} · ${seg} · ${when}`)
    }
    lines.push('', 'Cancel with *cast cancel <id>*.')
    return lines.join('\n')
  } catch {
    return 'Could not load casts right now — try again shortly.'
  }
}

export async function cancelCast(id: number): Promise<boolean> {
  try {
    const res = await getSupabase()
      .from('bot_casts')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('status', ['scheduled', 'sending'])
      .select('id')
    return !!res.data && res.data.length > 0
  } catch {
    return false
  }
}
