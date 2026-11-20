"use strict";
/**
 * Bot-specific Gemini functions without AI controls enforcement.
 * These are used by the WhatsApp bot which has simpler requirements.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.callGemini = callGemini;
exports.callGeminiParts = callGeminiParts;
exports.expandSearchQuery = expandSearchQuery;
exports.expandSearchQueryControlled = expandSearchQueryControlled;
exports.classifyIntent = classifyIntent;
const ai_cache_js_1 = require("./ai-cache.js");
const ai_budget_js_1 = require("./ai-budget.js");
const gemini_js_1 = require("./gemini.js");
// USD per 1M tokens (https://ai.google.dev/pricing). Unknown models fall back
// to the most expensive rate we know, so the dashboard never understates cost.
const GEMINI_PRICING = {
    'gemini-3.8-flash': { input: 0.75, output: 3.75 },
    'gemini-3.6-flash': { input: 0.75, output: 3.75 },
    'gemini-3.5-flash': { input: 0.75, output: 3.75 },
    'gemini-3-flash-preview': { input: 0.75, output: 3.75 },
    'gemini-3.5-flash-lite': { input: 0.30, output: 2.50 },
    'gemini-flash-lite-latest': { input: 0.30, output: 2.50 },
    'gemini-3.1-flash-lite': { input: 0.25, output: 1.50 },
};
const DEFAULT_PRICING = { input: 0.75, output: 3.75 };
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
async function logBotUsage(params) {
    try {
        const pricing = GEMINI_PRICING[params.model] || DEFAULT_PRICING;
        const inputCost = (params.inputTokens / 1_000_000) * pricing.input;
        const outputCost = (params.outputTokens / 1_000_000) * pricing.output;
        const estimatedCost = inputCost + outputCost;
        const { getSupabase } = await import('./supabase-server.js');
        const supabase = getSupabase();
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
        });
    }
    catch {
        // Logging failures must never block the main request
    }
}
// Same entry point as the text path: it walks the model chain and logs the
// provider error, so a photo that cannot be read says why in the logs.
async function fetchGeminiBot(body, timeoutMs = gemini_js_1.GEMINI_TIMEOUT) {
    return (0, gemini_js_1.generateGeminiText)(body, timeoutMs);
}
// A capped day is high volume by definition, so leave one visible row every
// ten minutes instead of one per message.
async function logBudgetBlock(model, logParams) {
    if (!(0, ai_budget_js_1.shouldLogBudgetBlock)())
        return;
    const budget = await (0, ai_budget_js_1.checkAiBudget)();
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
    });
}
async function callGemini(prompt, logParams) {
    const start = Date.now();
    const result = await fetchGeminiBot({ contents: [{ parts: [{ text: prompt }] }] });
    if (!result.text) {
        if (result.budgetBlocked)
            await logBudgetBlock(result.model, logParams);
        return null;
    }
    const inputTokens = estimateTokens(prompt);
    const outputTokens = estimateTokens(result.text);
    await logBotUsage({
        feature: logParams?.feature || 'bot',
        model: result.model || gemini_js_1.GEMINI_MODEL,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - start,
        status: result.text ? '200' : 'error',
        businessId: logParams?.businessId || null,
        channel: logParams?.channel || 'whatsapp',
        metadata: logParams?.metadata,
    });
    return result.text;
}
async function callGeminiParts(parts, logParams) {
    const start = Date.now();
    const body = { contents: [{ parts }] };
    const result = await fetchGeminiBot(body, gemini_js_1.GEMINI_VISION_TIMEOUT);
    if (!result.text) {
        if (result.budgetBlocked)
            await logBudgetBlock(result.model, logParams);
        return null;
    }
    const inputTokens = estimateTokens(JSON.stringify(body));
    const outputTokens = estimateTokens(result.text);
    await logBotUsage({
        feature: logParams?.feature || 'bot',
        model: result.model || gemini_js_1.GEMINI_MODEL,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - start,
        status: result.text ? '200' : 'error',
        businessId: logParams?.businessId || null,
        channel: logParams?.channel || 'whatsapp',
        metadata: logParams?.metadata,
    });
    return result.text;
}
async function expandSearchQuery(query) {
    if (!(0, gemini_js_1.hasGeminiKey)() || !query.trim())
        return [];
    const cacheKey = `search_expand:${query.trim().toLowerCase()}`;
    const cached = await (0, ai_cache_js_1.getCached)(cacheKey);
    if (cached)
        return cached;
    const text = await callGemini(`Given a search query "${query}" for a Zimbabwe business directory called WA Directory. Suggest 3-5 related search terms, synonyms, or category names a customer might be looking for. Return ONLY a valid JSON array of strings. No markdown, no explanation. Example: ["pharmacy","medicine","chemist","health"]`, { feature: 'search_expansion', channel: 'whatsapp' });
    if (!text)
        return [];
    try {
        const match = text.match(/\[[\s\S]*?\]/);
        if (match) {
            // Gemini occasionally returns null/empty elements inside the array;
            // callers call string methods on every element, so anything that is
            // not a non-empty string must be dropped BEFORE it is cached — a
            // poisoned cache entry would crash every future search that day.
            const parsed = JSON.parse(match[0]);
            const result = parsed.filter((s) => typeof s === 'string' && !!s.trim());
            await (0, ai_cache_js_1.setCached)(cacheKey, result);
            return result;
        }
    }
    catch {
        // fall through — expansion is optional
    }
    return [];
}
async function expandSearchQueryControlled(query) {
    return expandSearchQuery(query);
}
// What the current step is asking, for the intent fallback prompt.
const INTENT_ASKS = {
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
};
const INTENT_HINTS = new Set([
    'register',
    'pay',
    'need',
    'order',
    'search',
    'menu',
    'continue',
]);
const INTENT_PROMPT = (ask, text) => `You are reading one reply inside a WhatsApp business-directory bot. The bot is mid-flow and just asked for ${ask}.\nClassify the reply as exactly one of:\n- continue: it answers what the bot asked for\n- register: they want to register or list a business instead\n- pay: they want to pay, renew, or learn what a listing costs\n- need: they want suppliers to quote them on a posted need\n- order: they are giving items to order and buy\n- search: they are looking for products, shops or services to find\n- menu: they want the main options\nReply: "${text}"\nAnswer ONLY with JSON {"intent":"<kind>"}.`;
async function classifyIntent(text, step, businessId) {
    if (!(0, gemini_js_1.hasGeminiKey)() || !text.trim())
        return null;
    const norm = text.trim().replace(/\s+/g, ' ').toLowerCase();
    const cacheKey = `intent:${step}:${norm}`;
    const cached = await (0, ai_cache_js_1.getCached)(cacheKey);
    if (cached && INTENT_HINTS.has(cached))
        return cached;
    const ask = INTENT_ASKS[step] || 'an answer to its question';
    const result = await callGemini(INTENT_PROMPT(ask, norm), { feature: 'intent_classification', businessId, channel: 'whatsapp' });
    let intent = null;
    try {
        const parsed = JSON.parse(result || '');
        if (parsed?.intent && INTENT_HINTS.has(parsed.intent)) {
            intent = parsed.intent;
        }
    }
    catch {
        // fall through — the fallback stays null
    }
    if (intent)
        await (0, ai_cache_js_1.setCached)(cacheKey, intent);
    return intent;
}
