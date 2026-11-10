import { getCached, setCached } from './ai-cache.js'

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
export const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`

// Single Gemini entry point: posts one prompt, returns the trimmed first
// candidate text — or null when the call fails or the response is empty.
// Callers own their fallback copy and caching.
export const GEMINI_TIMEOUT = 8_000
export const GEMINI_VISION_TIMEOUT = 25_000

async function fetchGemini(body: unknown, timeoutMs = GEMINI_TIMEOUT): Promise<{ text: string | null }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const data = await res.json()
    return { text: data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null }
  } catch {
    return { text: null }
  } finally {
    clearTimeout(timer)
  }
}

/** Multimodal twin of callGemini for voice notes and photos: text and
 * inline_data parts (base64 bytes) in one generateContent call, same model
 * and key. Returns the trimmed first candidate text or null. */
export interface GeminiPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

/**
 * Structured multimodal call: sends text + inline images and asks the model for
 * JSON. The response is parsed here but remains untrusted input — callers must
 * still validate every field.
 *
 * Returns null on any transport, timeout, empty or unparseable response so the
 * caller can fall back to manual entry.
 */
export async function callGeminiJson(
  parts: GeminiPart[],
  options: {
    schema?: Record<string, unknown>
    temperature?: number
    maxOutputTokens?: number
    timeoutMs?: number
  } = {}
): Promise<unknown | null> {
  const body: Record<string, unknown> = {
    contents: [{ parts }],
    generationConfig: {
      temperature: options.temperature ?? 0.1,
      responseMimeType: 'application/json',
      ...(options.schema ? { responseSchema: options.schema } : {}),
      ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
    },
  }
  const result = await fetchGemini(
    body,
    options.timeoutMs ?? GEMINI_VISION_TIMEOUT
  )
  if (!result.text) return null
  // Models sometimes wrap JSON in a ```json fence despite the MIME type.
  const cleaned = result.text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/[\[{][\s\S]*[\}\]]/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

export function hasGeminiKey(): boolean {
  return !!process.env.GEMINI_API_KEY
}