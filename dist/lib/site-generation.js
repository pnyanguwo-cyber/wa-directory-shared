"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSiteContent = generateSiteContent;
async function generateSiteContent(input, gen) {
    const cacheKey = `site_content:${input.businessName.toLowerCase().trim()}:${input.city.toLowerCase().trim()}`;
    if (gen) {
        const cached = await gen.getCached(cacheKey);
        if (cached)
            return cached;
    }
    const fallback = {
        hero: input.bio && input.bio.trim()
            ? input.bio.trim().slice(0, 220)
            : `Welcome to ${input.businessName}. We deliver quality ${input.category} services in ${input.city || 'Zimbabwe'} with care and reliability.`,
        services: `We specialise in ${input.category || 'professional'} services, providing dependable, affordable and friendly support for every client. Reach out on WhatsApp for a quote.`,
    };
    if (!gen || !gen.callGemini)
        return fallback;
    const text = await gen.callGemini(`Write website copy for a local business called "${input.businessName}"${input.city ? ` in ${input.city}` : ''}. Category: ${input.category || 'services'}. Bio: ${input.bio || ''}. Return ONLY a JSON object with two string keys: "hero" (a short friendly headline + intro, max 2 sentences) and "services" (a short services overview, max 3 sentences). No markdown, no keys other than hero/services, no explanation.`) || '';
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
        try {
            const parsed = JSON.parse(match[0]);
            if (parsed.hero && typeof parsed.hero === 'string' && parsed.hero.trim()) {
                const content = { hero: parsed.hero.trim().slice(0, 500), services: parsed.services?.trim() || fallback.services };
                await gen.setCached(cacheKey, content);
                return content;
            }
        }
        catch {
            // Malformed JSON from the model → fall through to the default copy.
        }
    }
    return fallback;
}
