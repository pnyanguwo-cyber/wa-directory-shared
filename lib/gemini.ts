import { getCached, setCached } from './ai-cache.js'
import { checkAiBudget } from './ai-budget.js'
import { markAiQuotaExhausted } from './ai-limit.js'

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash'

// Google caps each model's free-tier daily quota separately and retires models
// without notice, so one exhausted or removed model must not take every AI
// feature down with it. Walk the chain until one answers: the last two keep
// photo recognition alive when the flagship model is out of quota.
export const GEMINI_MODEL_CANDIDATES: string[] = Array.from(
  new Set(
    [
      GEMINI_MODEL,
      'gemini-3.8-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
    ].filter(Boolean)
  )
)
const RETRIABLE_STATUS = new Set([404, 429, 503])

export const buildGeminiUrl = (model: string = GEMINI_MODEL) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`
export const GEMINI_URL = buildGeminiUrl()

// Single Gemini entry point: posts one prompt, returns the trimmed first
// candidate text — or null when the call fails or the response is empty.
// Callers own their fallback copy and caching.
export const GEMINI_TIMEOUT = 8_000
export const GEMINI_VISION_TIMEOUT = 25_000

/**
 * Posts one generateContent body, trying each candidate model in turn.
 *
 * Returns null when every model fails or the total deadline passes, and logs
 * the last provider error so a quota or retired-model failure is visible in
 * the platform logs instead of looking like "AI could not recognise this".
 */
export async function generateGeminiText(
  body: unknown,
  timeoutMs = GEMINI_TIMEOUT
): Promise<{ text: string | null; model: string; budgetBlocked?: boolean }> {
  // Spend ceiling: past the day's limit no request reaches Google at all.
  // Callers already have non-AI fallbacks for a null result.
  const budget = await checkAiBudget()
  if (!budget.allowed) {
    console.warn(
      `[gemini] daily budget reached ($${budget.spent.toFixed(2)} of $${budget.limit}), skipping`
    )
    return { text: null, model: GEMINI_MODEL_CANDIDATES[0], budgetBlocked: true }
  }

  const deadline = Date.now() + timeoutMs * 2
  let lastStatus = 0
  let lastMessage = ''
  let usedModel = GEMINI_MODEL_CANDIDATES[0]

  for (const model of GEMINI_MODEL_CANDIDATES) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break

    usedModel = model
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), Math.min(timeoutMs, remaining))
    try {
      const res = await fetch(buildGeminiUrl(model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        lastStatus = res.status
        lastMessage = data?.error?.message || 'API error'
        const isLast = model === GEMINI_MODEL_CANDIDATES[GEMINI_MODEL_CANDIDATES.length - 1]
        if (RETRIABLE_STATUS.has(res.status) && !isLast) continue
        break
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
      if (text) return { text, model }
      lastStatus = res.status
      lastMessage = 'empty candidate'
    } catch (err) {
      lastStatus = 0
      lastMessage = err instanceof Error ? err.message : String(err)
    } finally {
      clearTimeout(timer)
    }
  }

  console.warn(
    `[gemini] every model failed (last ${lastStatus || 'network'}: ${String(lastMessage).slice(0, 160)})`
  )
  // Every model refusing with 429 is the day's quota, not a blip: remember when
  // it clears so customers can be told the exact time instead of a dead end.
  if (lastStatus === 429) await markAiQuotaExhausted()
  return { text: null, model: usedModel }
}

async function fetchGemini(body: unknown, timeoutMs = GEMINI_TIMEOUT): Promise<{ text: string | null }> {
  return generateGeminiText(body, timeoutMs)
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