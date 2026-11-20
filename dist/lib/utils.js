"use strict";
// General-purpose utility helpers.
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanBio = cleanBio;
exports.slugify = slugify;
exports.formatPrice = formatPrice;
exports.getInitials = getInitials;
exports.dedupeCategories = dedupeCategories;
/** Strip em-dashes from bio/description text, replacing them with a colon. */
function cleanBio(text) {
    if (!text)
        return '';
    return text.replace(/\s*—\s*/g, ': ');
}
/** URL-friendly slug: lowercase, non-alphanumerics → hyphens, trimmed ends. */
function slugify(text, maxLength = 60) {
    return (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, maxLength);
}
/** Format a price as a fixed 2-decimal dollar string ('$, null-safe). */
function formatPrice(price) {
    const n = Number(price ?? 0);
    return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}
/** First letter of up to the first two words, upper-cased. */
function getInitials(name, fallback = '') {
    return ((name || '')
        .split(' ')
        .filter(Boolean)
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || fallback);
}
/** Clean and case-insensitively deduplicate category arrays. */
function dedupeCategories(cats) {
    if (!Array.isArray(cats)) {
        if (typeof cats === 'string' && cats.trim()) {
            return [cats.trim()];
        }
        return [];
    }
    const seen = new Set();
    const result = [];
    for (const c of cats) {
        if (typeof c === 'string' && c.trim()) {
            const trimmed = c.trim();
            const lower = trimmed.toLowerCase();
            if (!seen.has(lower)) {
                seen.add(lower);
                result.push(trimmed);
            }
        }
    }
    return result.slice(0, 4);
}
