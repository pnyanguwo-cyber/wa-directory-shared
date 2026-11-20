/**
 * Bot-specific Gemini functions without AI controls enforcement.
 * These are used by the WhatsApp bot which has simpler requirements.
 */
import { type GeminiPart } from './gemini.js';
export declare function callGemini(prompt: string, logParams?: {
    feature: string;
    businessId?: string | null;
    channel?: string;
    metadata?: Record<string, unknown>;
}): Promise<string | null>;
export declare function callGeminiParts(parts: GeminiPart[], logParams?: {
    feature: string;
    businessId?: string | null;
    channel?: string;
    metadata?: Record<string, unknown>;
}): Promise<string | null>;
export declare function expandSearchQuery(query: string): Promise<string[]>;
export declare function expandSearchQueryControlled(query: string): Promise<string[]>;
export type IntentKind = 'register' | 'pay' | 'need' | 'order' | 'search' | 'menu' | 'continue';
export declare function classifyIntent(text: string, step: string, businessId?: string | null): Promise<IntentKind | null>;
//# sourceMappingURL=gemini-bot.d.ts.map