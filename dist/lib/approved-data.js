"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApprovedCategories = getApprovedCategories;
exports.getApprovedCategoryNames = getApprovedCategoryNames;
exports.getApprovedAreas = getApprovedAreas;
exports.getApprovedAreaNames = getApprovedAreaNames;
exports.getApprovedCities = getApprovedCities;
exports.matchCategoryAgainst = matchCategoryAgainst;
// Approved categories/areas/cities - shared by webapp and chatbot.
// Caching is injected by the host (webapp uses next/cache, chatbot uses simple TTL).
const supabase_server_js_1 = require("./supabase-server.js");
const categories_js_1 = require("../data/categories.js");
const zimbabwe_locations_js_1 = require("../data/zimbabwe-locations.js");
// Simple in-memory cache with TTL for environments without next/cache
function createMemoryCache() {
    const store = new Map();
    return {
        async get(key) {
            const entry = store.get(key);
            if (!entry)
                return null;
            if (Date.now() > entry.expiry) {
                store.delete(key);
                return null;
            }
            return entry.value;
        },
        async set(key, value) {
            store.set(key, { value, expiry: Date.now() + 5 * 60 * 1000 }); // 5 min TTL
        },
    };
}
const defaultCache = createMemoryCache();
async function fetchApprovedCategories(cache) {
    const cached = await cache.get('approved-categories');
    if (cached)
        return cached;
    try {
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('categories')
            .select('name, icon, keywords')
            .eq('active', true)
            .order('name', { ascending: true });
        if (data && data.length > 0) {
            const result = data;
            await cache.set('approved-categories', result);
            return result;
        }
    }
    catch { }
    const result = categories_js_1.categories.map(c => ({ name: c.name, icon: c.icon, keywords: c.keywords }));
    await cache.set('approved-categories', result);
    return result;
}
async function getApprovedCategories(cache = defaultCache) {
    return fetchApprovedCategories(cache);
}
async function getApprovedCategoryNames(cache = defaultCache) {
    const rows = await getApprovedCategories(cache);
    return new Set(rows.map(r => r.name));
}
async function fetchApprovedAreas(cache) {
    const cached = await cache.get('approved-areas');
    if (cached)
        return cached;
    try {
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('areas')
            .select('city, name')
            .eq('active', true);
        const result = (data || []);
        await cache.set('approved-areas', result);
        return result;
    }
    catch {
        const result = [];
        await cache.set('approved-areas', result);
        return result;
    }
}
async function getApprovedAreas(cache = defaultCache) {
    return fetchApprovedAreas(cache);
}
async function getApprovedAreaNames(city, cache = defaultCache) {
    const rows = await getApprovedAreas(cache);
    return new Set(rows.filter(r => r.city === city).map(r => r.name));
}
async function fetchApprovedCities(cache) {
    const cached = await cache.get('approved-cities');
    if (cached)
        return cached;
    const staticCityNames = new Set(zimbabwe_locations_js_1.zimbabweCities.map(c => c.name));
    try {
        const { data } = await (0, supabase_server_js_1.getSupabase)()
            .from('cities')
            .select('name')
            .eq('active', true)
            .order('name', { ascending: true });
        const dbCities = (data || []);
        const merged = new Map();
        for (const c of dbCities)
            merged.set(c.name.toLowerCase(), c);
        for (const name of staticCityNames) {
            if (!merged.has(name.toLowerCase()))
                merged.set(name.toLowerCase(), { name });
        }
        const result = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
        await cache.set('approved-cities', result);
        return result;
    }
    catch {
        const result = zimbabwe_locations_js_1.zimbabweCities.map(c => ({ name: c.name }));
        await cache.set('approved-cities', result);
        return result;
    }
}
async function getApprovedCities(cache = defaultCache) {
    return fetchApprovedCities(cache);
}
function matchCategoryAgainst(input, approved) {
    const lower = input.toLowerCase().trim();
    if (!lower)
        return 'Other';
    for (const c of approved) {
        if (c.name.toLowerCase() === lower)
            return c.name;
    }
    for (const c of approved) {
        if (c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase()))
            return c.name;
    }
    let bestMatch = null;
    let bestScore = 0;
    for (const c of approved) {
        for (const kw of c.keywords || []) {
            const kwLower = kw.toLowerCase();
            if (kwLower.includes(lower) || lower.includes(kwLower)) {
                const score = kwLower.includes(lower)
                    ? kwLower.length / Math.max(lower.length, 1)
                    : lower.length / Math.max(kwLower.length, 1);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = c.name;
                }
            }
        }
    }
    if (bestMatch)
        return bestMatch;
    const staticMatchResult = (0, categories_js_1.matchCategory)(input);
    return staticMatchResult;
}
