import { getSupabase } from './supabase-server.js'

// bot_settings KV: the admin digest cursor, the dormant priority-supplier
// switch, and future small config values. Never throws — missing keys read
// as empty strings.

export async function getBotSetting(key: string): Promise<string> {
  try {
    const { data } = await getSupabase()
      .from('bot_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()
    return data && typeof data.value === 'string' ? data.value : ''
  } catch {
    return ''
  }
}

export async function setBotSetting(key: string, value: string): Promise<boolean> {
  try {
    await getSupabase()
      .from('bot_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    return true
  } catch {
    return false
  }
}
