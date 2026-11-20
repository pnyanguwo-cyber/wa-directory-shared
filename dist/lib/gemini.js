"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GEMINI_VISION_TIMEOUT = exports.GEMINI_TIMEOUT = exports.GEMINI_URL = exports.buildGeminiUrl = exports.GEMINI_MODEL_CANDIDATES = exports.GEMINI_MODEL = void 0;
exports.generateGeminiText = generateGeminiText;
exports.callGeminiJson = callGeminiJson;
exports.hasGeminiKey = hasGeminiKey;
const ai_budget_js_1 = require("./ai-budget.js");
const ai_limit_js_1 = require("./ai-limit.js");
exports.GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
// Google caps each model's free-tier daily quota separately and retires models
// without notice, so one exhausted or removed model must not take every AI
// feature down with it. Walk the chain until one answers: the last two keep
// photo recognition alive when the flagship model is out of quota.
exports.GEMINI_MODEL_CANDIDATES = Array.from(new Set([
    exports.GEMINI_MODEL,
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
].filter(Boolean)));
const RETRIABLE_STATUS = new Set([404, 429, 503]);
const buildGeminiUrl = (model = exports.GEMINI_MODEL) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
exports.buildGeminiUrl = buildGeminiUrl;
exports.GEMINI_URL = (0, exports.buildGeminiUrl)();
// Single Gemini entry point: posts one prompt, returns the trimmed first
// candidate text — or null when the call fails or the response is empty.
// Callers own their fallback copy and caching.
exports.GEMINI_TIMEOUT = 8_000;
exports.GEMINI_VISION_TIMEOUT = 25_000;
/**
 * Posts one generateContent body, trying each candidate model in turn.
 *
 * Returns null when every model fails or the total deadline passes, and logs
 * the last provider error so a quota or retired-model failure is visible in
 * the platform logs instead of looking like "AI could not recognise this".
 */
async function generateGeminiText(body, timeoutMs = exports.GEMINI_TIMEOUT) {
    // Spend ceiling: past the day's limit no request reaches Google at all.
    // Callers already have non-AI fallbacks for a null result.
    const budget = await (0, ai_budget_js_1.checkAiBudget)();
    if (!budget.allowed) {
        console.warn(`[gemini] daily budget reached ($${budget.spent.toFixed(2)} of $${budget.limit}), skipping`);
        return { text: null, model: exports.GEMINI_MODEL_CANDIDATES[0], budgetBlocked: true };
    }
    const deadline = Date.now() + timeoutMs * 2;
    let lastStatus = 0;
    let lastMessage = '';
    let usedModel = exports.GEMINI_MODEL_CANDIDATES[0];
    for (const model of exports.GEMINI_MODEL_CANDIDATES) {
        const remaining = deadline - Date.now();
        if (remaining <= 0)
            break;
        usedModel = model;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), Math.min(timeoutMs, remaining));
        try {
            const res = await fetch((0, exports.buildGeminiUrl)(model), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: ctrl.signal,
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                lastStatus = res.status;
                lastMessage = data?.error?.message || 'API error';
                const isLast = model === exports.GEMINI_MODEL_CANDIDATES[exports.GEMINI_MODEL_CANDIDATES.length - 1];
                if (RETRIABLE_STATUS.has(res.status) && !isLast)
                    continue;
                break;
            }
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
            if (text)
                return { text, model };
            lastStatus = res.status;
            lastMessage = 'empty candidate';
        }
        catch (err) {
            lastStatus = 0;
            lastMessage = err instanceof Error ? err.message : String(err);
        }
        finally {
            clearTimeout(timer);
        }
    }
    console.warn(`[gemini] every model failed (last ${lastStatus || 'network'}: ${String(lastMessage).slice(0, 160)})`);
    // Every model refusing with 429 is the day's quota, not a blip: remember when
    // it clears so customers can be told the exact time instead of a dead end.
    if (lastStatus === 429)
        await (0, ai_limit_js_1.markAiQuotaExhausted)();
    return { text: null, model: usedModel };
}
async function fetchGemini(body, timeoutMs = exports.GEMINI_TIMEOUT) {
    return generateGeminiText(body, timeoutMs);
}
/**
 * Structured multimodal call: sends text + inline images and asks the model for
 * JSON. The response is parsed here but remains untrusted input — callers must
 * still validate every field.
 *
 * Returns null on any transport, timeout, empty or unparseable response so the
 * caller can fall back to manual entry.
 */
async function callGeminiJson(parts, options = {}) {
    const body = {
        contents: [{ parts }],
        generationConfig: {
            temperature: options.temperature ?? 0.1,
            responseMimeType: 'application/json',
            ...(options.schema ? { responseSchema: options.schema } : {}),
            ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
        },
    };
    const result = await fetchGemini(body, options.timeoutMs ?? exports.GEMINI_VISION_TIMEOUT);
    if (!result.text)
        return null;
    // Models sometimes wrap JSON in a ```json fence despite the MIME type.
    const cleaned = result.text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    try {
        return JSON.parse(cleaned);
    }
    catch {
        const match = cleaned.match(/[\[{][\s\S]*[\}\]]/);
        if (!match)
            return null;
        try {
            return JSON.parse(match[0]);
        }
        catch {
            return null;
        }
    }
}
function hasGeminiKey() {
    return !!process.env.GEMINI_API_KEY;
}
