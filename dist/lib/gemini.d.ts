export declare const GEMINI_MODEL: string;
export declare const GEMINI_MODEL_CANDIDATES: string[];
export declare const buildGeminiUrl: (model?: string) => string;
export declare const GEMINI_URL: string;
export declare const GEMINI_TIMEOUT = 8000;
export declare const GEMINI_VISION_TIMEOUT = 25000;
/**
 * Posts one generateContent body, trying each candidate model in turn.
 *
 * Returns null when every model fails or the total deadline passes, and logs
 * the last provider error so a quota or retired-model failure is visible in
 * the platform logs instead of looking like "AI could not recognise this".
 */
export declare function generateGeminiText(body: unknown, timeoutMs?: number): Promise<{
    text: string | null;
    model: string;
    budgetBlocked?: boolean;
}>;
/** Multimodal twin of callGemini for voice notes and photos: text and
 * inline_data parts (base64 bytes) in one generateContent call, same model
 * and key. Returns the trimmed first candidate text or null. */
export interface GeminiPart {
    text?: string;
    inline_data?: {
        mime_type: string;
        data: string;
    };
}
/**
 * Structured multimodal call: sends text + inline images and asks the model for
 * JSON. The response is parsed here but remains untrusted input — callers must
 * still validate every field.
 *
 * Returns null on any transport, timeout, empty or unparseable response so the
 * caller can fall back to manual entry.
 */
export declare function callGeminiJson(parts: GeminiPart[], options?: {
    schema?: Record<string, unknown>;
    temperature?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
}): Promise<unknown | null>;
export declare function hasGeminiKey(): boolean;
//# sourceMappingURL=gemini.d.ts.map