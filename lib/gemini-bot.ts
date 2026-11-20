/**
 * Bot-specific Gemini functions without AI controls enforcement.
 * These are used by the WhatsApp bot which has simpler requirements.
 */

import { getCached, setCached } from './ai-cache.js'
import { checkAiBudget, shouldLogBudgetBlock } from './ai-budget.js'
import { hasGeminiKey, callGeminiJson, generateGeminiText, type GeminiPart, GEMINI_MODEL, GEMINI_TIMEOUT, GEMINI_VISION_TIMEOUT } from './gemini.js'

// USD per 1M tokens (https://ai.google.dev/pricing). Unknown models fall back
// to the most expensive rate we know, so the dashboard never understates cost.
const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-3.6-flash': { input: 0.75, output: 3.75 },
  'gemini-3.5-flash': { input: 0.75, output: 3.75 },
  'gemini-3-flash-preview': { input: 0.75, output: 3.75 },
  'gemini-3.5-flash-lite': { input: 0.30, output: 2.50 },
  'gemini-flash-lite-latest': { input: 0.30, output: 2.50 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.50 },
}
const DEFAULT_PRICING = { input: 0.75, output: 3.75 }

interface UsageLogParams {
  feature: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  status: string
  errorMessage?: string
  businessId?: string | null
  channel?: string
  metadata?: Record<string, unknown>
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

async function logBotUsage(params: UsageLogParams): Promise<void> {
  try {
    const pricing = GEMINI_PRICING[params.model] || DEFAULT_PRICING
    const inputCost = (params.inputTokens / 1_000_000) * pricing.input
    const outputCost = (params.outputTokens / 1_000_000) * pricing.output
    const estimatedCost = inputCost + outputCost

    const { getSupabase } = await import('./supabase-server.js')
    const supabase = getSupabase()
    await supabase.from('ai_usage_log').insert({
      feature: params.feature,
      model: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      total_tokens: params.inputTokens + params.outputTokens,
      latency_ms: params.latencyMs,
      estimated_cost_usd: estimatedCost,
      status: params.status,
      error_message: params.errorMessage || null,
      business_id: params.businessId || null,
      channel: params.channel || 'whatsapp',
      metadata: params.metadata || {},
    })
  } catch {
    // Logging failures must never block the main request
  }
}

// Same entry point as the text path: it walks the model chain and logs the
// provider error, so a photo that cannot be read says why in the logs.
async function fetchGeminiBot(
  body: unknown,
  timeoutMs = GEMINI_TIMEOUT
): Promise<{ text: string | null; model: string; budgetBlocked?: boolean }> {
  return generateGeminiText(body, timeoutMs)
}

// A capped day is high volume by definition, so leave one visible row every
// ten minutes instead of one per message.
async function logBudgetBlock(
  model: string,
  logParams?: { feature: string; businessId?: string | null; channel?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  if (!shouldLogBudgetBlock()) return
  const budget = await checkAiBudget()
  await logBotUsage({
    feature: logParams?.feature || 'bot',
    model,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    status: 'blocked_daily_budget',
    errorMessage: `Daily AI budget reached ($${budget.spent.toFixed(2)} of $${budget.limit})`,
    businessId: logParams?.businessId || null,
    channel: logParams?.channel || 'whatsapp',
    metadata: { ...(logParams?.metadata || {}), spentUsd: budget.spent, limitUsd: budget.limit },
  })
}

export async function callGemini(
  prompt: string,
  logParams?: { feature: string; businessId?: string | null; channel?: string; metadata?: Record<string, unknown> }
): Promise<string | null> {
  const start = Date.now()
  const result = await fetchGeminiBot({ contents: [{ parts: [{ text: prompt }] }] })
  if (!result.text) {
    if (result.budgetBlocked) await logBudgetBlock(result.model, logParams)
    return null
  }
  const inputTokens = estimateTokens(prompt)
  const outputTokens = estimateTokens(result.text)
  await logBotUsage({
    feature: logParams?.feature || 'bot',
    model: result.model || GEMINI_MODEL,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - start,
    status: result.text ? '200' : 'error',
    businessId: logParams?.businessId || null,
    channel: logParams?.channel || 'whatsapp',
    metadata: logParams?.metadata,
  })
  return result.text
}

export async function callGeminiParts(
  parts: GeminiPart[],
  logParams?: { feature: string; businessId?: string | null; channel?: string; metadata?: Record<string, unknown> }
): Promise<string | null> {
  const start = Date.now()
  const body = { contents: [{ parts }] }
  const result = await fetchGeminiBot(body, GEMINI_VISION_TIMEOUT)
  if (!result.text) {
    if (result.budgetBlocked) await logBudgetBlock(result.model, logParams)
    return null
  }
  const inputTokens = estimateTokens(JSON.stringify(body))
  const outputTokens = estimateTokens(result.text)
  await logBotUsage({
    feature: logParams?.feature || 'bot',
    model: result.model || GEMINI_MODEL,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - start,
    status: result.text ? '200' : 'error',
    businessId: logParams?.businessId || null,
    channel: logParams?.channel || 'whatsapp',
    metadata: logParams?.metadata,
  })
  return result.text
}

export async function expandSearchQuery(query: string): Promise<string[]> {
  if (!hasGeminiKey() || !query.trim()) return []

  const cacheKey = `search_expand:${query.trim().toLowerCase()}`
  const cached = await getCached<string[]>(cacheKey)
  if (cached) return cached

  const text = await callGemini(
    `Given a search query "${query}" for a Zimbabwe business directory called WA Directory. Suggest 3-5 related search terms, synonyms, or category names a customer might be looking for. Return ONLY a valid JSON array of strings. No markdown, no explanation. Example: ["pharmacy","medicine","chemist","health"]`,
    { feature: 'search_expansion', channel: 'whatsapp' }
  )
  if (!text) return []

  try {
    const match = text.match(/\[[\s\S]*?\]/)
    if (match) {
      // Gemini occasionally returns null/empty elements inside the array;
      // callers call string methods on every element, so anything that is
      // not a non-empty string must be dropped BEFORE it is cached — a
      // poisoned cache entry would crash every future search that day.
      const parsed = JSON.parse(match[0]) as unknown[]
      const result = parsed.filter(
        (s): s is string => typeof s === 'string' && !!s.trim()
      )
      await setCached(cacheKey, result)
      return result
    }
  } catch {
    // fall through — expansion is optional
  }
  return []
}

export async function expandSearchQueryControlled(query: string): Promise<string[]> {
  return expandSearchQuery(query)
}

// What the current step is asking, for the intent fallback prompt.
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

export async function classifyIntent(
  text: string,
  step: string,
  businessId?: string | null
): Promise<IntentKind | null> {
  if (!hasGeminiKey() || !text.trim()) return null
  const norm = text.trim().replace(/\s+/g, ' ').toLowerCase()
  const cacheKey = `intent:${step}:${norm}`
  const cached = await getCached<IntentKind>(cacheKey)
  if (cached && INTENT_HINTS.has(cached)) return cached

  const ask = INTENT_ASKS[step] || 'an answer to its question'
  const result = await callGemini(
    INTENT_PROMPT(ask, norm),
    { feature: 'intent_classification', businessId, channel: 'whatsapp' }
  )
  let intent: IntentKind | null = null
  try {
    const parsed = JSON.parse(result || '') as { intent?: string }
    if (parsed?.intent && INTENT_HINTS.has(parsed.intent as IntentKind)) {
      intent = parsed.intent as IntentKind
    }
  } catch {
    // fall through — the fallback stays null
  }
  if (intent) await setCached(cacheKey, intent)
  return intent
}