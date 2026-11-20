/**
 * Shared AI-ingestion helpers: image preparation for the vision model and the
 * defensive readers used to turn model output into typed fields.
 *
 * Model output is untrusted. Nothing from this file may be written to a
 * publishable column without going through the product/registration
 * validators.
 */
export declare const MAX_ANALYSIS_DIMENSION = 1024;
export declare const ANALYSIS_JPEG_QUALITY = 72;
export interface PreparedImage {
    base64: string;
    mimeType: string;
}
export declare function prepareImageForAnalysis(bytes: Uint8Array): Promise<PreparedImage | null>;
/** Reads { value, confidence, evidence, ... } shapes defensively. */
export interface RawField {
    value?: unknown;
    confidence?: unknown;
    evidence?: unknown;
    needs_confirmation?: unknown;
}
export declare function asRecord(value: unknown): Record<string, unknown>;
export declare function readField(value: unknown): RawField;
export declare function clampConfidence(value: unknown): number;
export declare function readString(value: unknown, maxLength?: number): string;
export declare function readStringArray(value: unknown, maxItems?: number, maxLength?: number): string[];
/**
 * Low-confidence values must not be presented as facts (brief §9.7). Anything
 * under the threshold is reported as missing so the seller is asked.
 */
export declare const CONFIDENCE_USABLE = 0.5;
export declare function isUsable(field: {
    value: string;
    confidence: number;
}): boolean;
//# sourceMappingURL=ai-vision.d.ts.map