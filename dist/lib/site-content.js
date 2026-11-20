"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAYS_ORDER = void 0;
exports.parseSiteContent = parseSiteContent;
exports.generateSiteSections = generateSiteSections;
exports.generateSiteDesign = generateSiteDesign;
exports.servicesToCards = servicesToCards;
exports.hoursRenderable = hoursRenderable;
const site_design_js_1 = require("./site-design.js");
// ---------------------------------------------------------------------------
// Whitelist parser for the businesses.site_content JSONB column.
// Everything stored in the DB goes through here before it reaches the
// flagship template, so a bad payload can never break rendering.
// ---------------------------------------------------------------------------
exports.DAYS_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const IMAGE_URL_RE = /^https:\/\/[^\s"'<>]+\.(png|jpe?g|webp|gif)(\?[^\s"'<>]*)?$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function cleanStr(value, maxLen) {
    if (typeof value !== 'string')
        return '';
    return value.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, maxLen);
}
function cleanImages(value, max) {
    if (!Array.isArray(value))
        return [];
    const out = [];
    for (const item of value) {
        if (typeof item === 'string' && IMAGE_URL_RE.test(item.trim()) && !out.includes(item.trim())) {
            out.push(item.trim().slice(0, 500));
            if (out.length >= max)
                break;
        }
    }
    return out;
}
function parseSiteContent(raw) {
    if (!raw || typeof raw !== 'object')
        return {};
    const source = raw;
    const blocks = {};
    const tagline = cleanStr(source.tagline, 140);
    if (tagline)
        blocks.tagline = tagline;
    if (Array.isArray(source.faq)) {
        const faq = [];
        for (const entry of source.faq.slice(0, 8)) {
            if (!entry || typeof entry !== 'object')
                continue;
            const q = cleanStr(entry.q, 220);
            const a = cleanStr(entry.a, 800);
            if (q && a)
                faq.push({ q, a });
        }
        if (faq.length)
            blocks.faq = faq;
    }
    if (Array.isArray(source.hours)) {
        const hours = [];
        for (const entry of source.hours.slice(0, 7)) {
            if (!entry || typeof entry !== 'object')
                continue;
            const row = entry;
            const day = cleanStr(row.day, 12);
            if (!day)
                continue;
            const open = cleanStr(row.open, 5);
            const close = cleanStr(row.close, 5);
            if (open && close && TIME_RE.test(open) && TIME_RE.test(close) && open !== close) {
                hours.push({ day, open, close });
            }
            else {
                // Explicit "closed" row keeps the order stable.
                hours.push({ day, open: '', close: '' });
            }
        }
        if (hours.length) {
            blocks.hours = hours.sort((a, b) => {
                const ia = exports.DAYS_ORDER.indexOf(a.day);
                const ib = exports.DAYS_ORDER.indexOf(b.day);
                return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
            });
        }
    }
    const gallery = cleanImages(source.gallery, 8);
    if (gallery.length)
        blocks.gallery = gallery;
    return blocks;
}
function fallbackSections(input) {
    const cat = input.category || 'local';
    return {
        tagline: `Trusted ${cat} specialists${input.city ? ` in ${input.city}` : ''}`,
        faq: [
            {
                q: `What services does ${input.businessName} offer?`,
                a: input.bio && input.bio.trim()
                    ? input.bio.trim().slice(0, 300)
                    : `${input.businessName} offers a full range of ${cat} services for homes and businesses. Chat with us on WhatsApp for a free quote.`,
            },
            { q: 'How do I get a quote?', a: 'Send us a WhatsApp message with what you need — we reply fast with pricing and availability.' },
            { q: 'Which areas do you serve?', a: input.city ? `We are based in ${input.city} and cover surrounding suburbs and towns. Contact us to confirm your location.` : 'We cover our local area and surrounds — message us to confirm yours.' },
            { q: 'Do you offer delivery?', a: 'Orders can be delivered or collected by arrangement. Chat with our team on WhatsApp to schedule.' },
        ],
    };
}
async function generateSiteSections(input) {
    const { getCached, setCached } = await import('./ai-cache.js');
    const cacheKey = `site_sections:v1:${input.businessName.toLowerCase().trim()}:${input.city.toLowerCase().trim()}`;
    const cached = await getCached(cacheKey);
    if (cached?.tagline && Array.isArray(cached.faq) && cached.faq.length) {
        return { tagline: String(cached.tagline), faq: cached.faq };
    }
    const fallback = fallbackSections(input);
    if (!process.env.GEMINI_API_KEY)
        return fallback;
    try {
        const { callGeminiJson } = await import('./gemini.js');
        const parts = [{
                text: `Write website copy for a local business called "${input.businessName}"${input.city ? ` in ${input.city}` : ''}. Category: ${input.category || 'services'}. Bio: ${input.bio || ''}. Return ONLY a JSON object: {"tagline": "<max 10 words>", "faq": [{"q": "<question>", "a": "<max 240 chars>"} x 4]} covering what customers usually ask (services, quote, areas, payment/delivery). No markdown, no extra keys, no explanation.`
            }];
        const result = await callGeminiJson(parts);
        if (result) {
            const tagline = typeof result.tagline === 'string' ? result.tagline.trim().slice(0, 140) : '';
            const faq = Array.isArray(result.faq)
                ? result.faq
                    .map((entry) => ({ q: cleanStr(entry?.q, 220), a: cleanStr(entry?.a, 800) }))
                    .filter((entry) => entry.q && entry.a)
                    .slice(0, 4)
                : [];
            if (tagline && faq.length) {
                const resultObj = { tagline, faq };
                await setCached(cacheKey, resultObj);
                return resultObj;
            }
        }
    }
    catch {
        // Generation is best-effort — never block rendering on it.
    }
    return fallback;
}
// ---------------------------------------------------------------------------
// Site services text → card grid. Bulleted "- " lines become cards; other
// sentences become cards of their own; plain prose falls back gracefully.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// AI design pick: maps a business to a template preset + font pair (S17).
// Deterministic category heuristics first, Gemini as the tie-breaker.
// ---------------------------------------------------------------------------
const CATEGORY_DESIGN = {
    'Hair & Beauty': { design: 'maison', font: 'editorial' },
    'Jewelry': { design: 'maison', font: 'editorial' },
    'Hotel & Lodging': { design: 'maison', font: 'editorial' },
    'Legal Services': { design: 'maison', font: 'editorial' },
    'Financial Services': { design: 'bolt', font: 'grotesk' },
    'IT & Web': { design: 'bolt', font: 'grotesk' },
    'Electronics': { design: 'bolt', font: 'grotesk' },
    'Fitness & Gym': { design: 'bolt', font: 'grotesk' },
    'Food & Restaurant': { design: 'craft', font: 'warm' },
    'Baker': { design: 'craft', font: 'warm' },
    'Brewery': { design: 'craft', font: 'warm' },
    'Clothing & Fashion': { design: 'craft', font: 'warm' },
    'Farming & Agriculture': { design: 'craft', font: 'warm' },
};
async function generateSiteDesign(input) {
    const heuristic = CATEGORY_DESIGN[input.category?.trim() || ''];
    if (!process.env.GEMINI_API_KEY)
        return heuristic || { design: 'classic', font: 'modern' };
    try {
        const { callGeminiJson } = await import('./gemini.js');
        const parts = [{
                text: `Pick an auto-website template and font for a local business called "${input.businessName}"${input.city ? ` in ${input.city}` : ''}. Category: ${input.category || 'services'}. Bio: ${input.bio || ''}. Choose design from exactly: classic, maison, bolt, craft (maison=editorial luxury serif, bolt=bold startup energy, craft=warm local maker, classic=clean default). Choose font from exactly: modern, editorial, grotesk, warm. Return ONLY JSON: {"design":"<one>","font":"<one>"}.`
            }];
        const result = await callGeminiJson(parts);
        if (result) {
            const design = typeof result.design === 'string' && site_design_js_1.SITE_DESIGN_KEYS.includes(result.design) ? result.design : '';
            const font = typeof result.font === 'string' && site_design_js_1.SITE_FONT_KEYS.includes(result.font) ? result.font : '';
            if (design)
                return { design, font: font || (0, site_design_js_1.getPreset)(design).defaultFont };
        }
    }
    catch {
        // Best-effort — fall through to heuristics.
    }
    return heuristic || { design: 'classic', font: 'modern' };
}
function servicesToCards(services) {
    if (!services || !services.trim())
        return [];
    const bulletLines = services
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => (line.startsWith('- ') ? line.slice(2).trim() : line))
        .filter(Boolean);
    if (!bulletLines.length)
        return [];
    return bulletLines.slice(0, 9);
}
function hoursRenderable(hours) {
    return Boolean(hours && hours.some((row) => row.open && row.close));
}
