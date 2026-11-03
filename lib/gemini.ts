import { getCached, setCached } from './ai-cache.js'

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`

// Single Gemini entry point: posts one prompt, returns the trimmed first
// candidate text — or null when the call fails or the response is empty.
// Callers own their fallback copy and caching.
const GEMINI_TIMEOUT = 8_000

async function fetchGemini(body: unknown): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT)
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const data = await res.json()
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function callGemini(prompt: string): Promise<string | null> {
  return fetchGemini({ contents: [{ parts: [{ text: prompt }] }] })
}

// Multimodal twin of callGemini for voice notes and photos: text and
// inline_data parts (base64 bytes) in one generateContent call, same model
// and key. Returns the trimmed first candidate text or null.
export interface GeminiPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

export async function callGeminiParts(parts: GeminiPart[]): Promise<string | null> {
  return fetchGemini({ contents: [{ parts }] })
}

const SEO_BLURB_FALLBACK = (category: string, location: string) =>
  `Find the best ${category} services in ${location}, Zimbabwe. WA Directory connects you with trusted local businesses via WhatsApp.`

const SEO_BLURB_NO_KEY = (category: string, location: string) =>
  `Find the best ${category} services in ${location}, Zimbabwe. Browse verified businesses, check ratings, read reviews, and start a WhatsApp conversation instantly. WA Directory connects you with trusted local businesses for all your ${category.toLowerCase()} needs.`

export async function generateSEOBlurb(category: string, location: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    return SEO_BLURB_NO_KEY(category, location)
  }

  const cacheKey = `seo_blurb:${category.toLowerCase()}:${location.toLowerCase()}`
  const cached = await getCached<string>(cacheKey)
  if (cached) return cached

  const text = await callGemini(
    `Write a 200-word SEO paragraph about the best ${category} businesses in ${location}, Zimbabwe. Structure it as a helpful guide for customers looking for ${category.toLowerCase()} services on WhatsApp. Include: benefits of using local providers, what to look for in a quality service, and how WA Directory helps customers connect with verified businesses. Write naturally, no fluff, no title. Just the paragraph. Do not use em-dashes (—), use commas or colons instead.`
  )
  const result = text || SEO_BLURB_FALLBACK(category, location)
  await setCached(cacheKey, result)
  return result
}

export async function expandSearchQuery(query: string): Promise<string[]> {
  if (!process.env.GEMINI_API_KEY || !query.trim()) return []

  const cacheKey = `search_expand:${query.trim().toLowerCase()}`
  const cached = await getCached<string[]>(cacheKey)
  if (cached) return cached

  const text = await callGemini(
    `Given a search query "${query}" for a Zimbabwe business directory called WA Directory. Suggest 3-5 related search terms, synonyms, or category names a customer might be looking for. Return ONLY a valid JSON array of strings. No markdown, no explanation. Example: ["pharmacy","medicine","chemist","health"]`
  )
  if (!text) return []

  try {
    const match = text.match(/\[[\s\S]*?\]/)
    if (match) {
      const result = JSON.parse(match[0]) as string[]
      await setCached(cacheKey, result)
      return result
    }
  } catch {
    // fall through — expansion is optional
  }
  return []
}

// What the current step is asking, for the intent fallback prompt. A short
// plain line is enough — the model only needs context to tell a stated plan
// change apart from an ordinary answer.
const INTENT_ASKS: Record<string, string> = {
  name: 'a business or owner name to register',
  username: 'a username for the listing URL',
  phone: 'a contact phone number',
  category: 'picking a business category from a list',
  description: 'describing the business in a few words',
  city: 'which town or city the business is in',
  area: 'which area of that town the business is in',
  confirm: 'confirming the listing details',
  list_form: 'listing items for sale, one per line',
  reg_contact: 'a personal contact for a personal listing',
  item_photo: 'a shelf or item photo',
  item_pick: 'choosing which item from a list',
  need_form: 'describing a need to post to suppliers',
  pay_search: 'a business name or number to look up before paying',
  pay_pick: 'choosing which business to pay for',
  pay_plan: 'choosing a payment plan or package',
  pay_ecocash: 'an EcoCash phone number to bill',
  search_loc: 'which town to search in',
  search_term: 'what to search for',
  browse: 'choosing what to browse from a list',
  order: 'reading out an order, item by item',
}

export type IntentKind =
  | 'register'
  | 'pay'
  | 'need'
  | 'order'
  | 'search'
  | 'menu'
  | 'continue'

const INTENT_HINTS = new Set<IntentKind>([
  'register',
  'pay',
  'need',
  'order',
  'search',
  'menu',
  'continue',
])

const INTENT_PROMPT = (ask: string, text: string) =>
  `You are reading one reply inside a WhatsApp business-directory bot. The bot is mid-flow and just asked for ${ask}.\nClassify the reply as exactly one of:\n- continue: it answers what the bot asked for\n- register: they want to register or list a business instead\n- pay: they want to pay, renew, or learn what a listing costs\n- need: they want suppliers to quote them on a posted need\n- order: they are giving items to order and buy\n- search: they are looking for products, shops or services to find\n- menu: they want the main options\nReply: "${text}"\nAnswer ONLY with JSON {"intent":"<kind>"}.`

// Last-resort intent check for mid-flow messages the regex rules could not
// classify. Cached per (step, trimmed text), so a repeated line costs nothing.
export async function classifyIntent(
  text: string,
  step: string
): Promise<IntentKind | null> {
  if (!process.env.GEMINI_API_KEY || !text.trim()) return null
  const norm = text.trim().replace(/\s+/g, ' ').toLowerCase()
  const cacheKey = `intent:${step}:${norm}`
  const cached = await getCached<IntentKind>(cacheKey)
  if (cached && INTENT_HINTS.has(cached)) return cached

  const ask = INTENT_ASKS[step] || 'an answer to its question'
  const body = {
    contents: [{ parts: [{ text: INTENT_PROMPT(ask, norm) }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      maxOutputTokens: 64,
    },
  }
  const raw = await fetchGemini(body)
  let intent: IntentKind | null = null
  try {
    const parsed = JSON.parse(raw || '') as { intent?: string }
    if (parsed?.intent && INTENT_HINTS.has(parsed.intent as IntentKind)) {
      intent = parsed.intent as IntentKind
    }
  } catch {
    // fall through — the fallback stays null
  }
  if (intent) await setCached(cacheKey, intent)
  return intent
}
