export type StatsEventType =
  | 'profile_view'
  | 'click_whatsapp'
  | 'click_call'
  | 'click_website'
  | 'impression'
  | 'qr_scan'
  | 'bot_search'
  | 'bot_chat_open'
  | 'share_bot'
  | 'share_web'

export const STAT_EVENT_LABELS: Record<StatsEventType, string> = {
  profile_view: 'Profile views',
  click_whatsapp: 'WhatsApp clicks',
  click_call: 'Call clicks',
  click_website: 'Website clicks',
  impression: 'Search impressions',
  qr_scan: 'QR scans',
  bot_search: 'Bot search hits',
  bot_chat_open: 'Bot chat opens',
  share_bot: 'Bot shares',
  share_web: 'Web shares',
}

export const STAT_EVENT_COLORS: Record<string, string> = {
  profile_view: '#25d366',
  click_whatsapp: '#128c7e',
  click_website: '#34b7f1',
  impression: '#a7c957',
  qr_scan: '#8338ec',
  bot_search: '#f4a261',
  bot_chat_open: '#e76f51',
  share_web: '#2a9d8f',
  share_bot: '#e9c46a',
  click_call: '#6d6875',
}

export function getEventLabel(type: string): string {
  return STAT_EVENT_LABELS[type as StatsEventType] || type
}

export function csvEscape(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}