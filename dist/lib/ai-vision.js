"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIDENCE_USABLE = exports.ANALYSIS_JPEG_QUALITY = exports.MAX_ANALYSIS_DIMENSION = void 0;
exports.prepareImageForAnalysis = prepareImageForAnalysis;
exports.asRecord = asRecord;
exports.readField = readField;
exports.clampConfidence = clampConfidence;
exports.readString = readString;
exports.readStringArray = readStringArray;
exports.isUsable = isUsable;
const sharp_1 = __importDefault(require("sharp"));
/**
 * Shared AI-ingestion helpers: image preparation for the vision model and the
 * defensive readers used to turn model output into typed fields.
 *
 * Model output is untrusted. Nothing from this file may be written to a
 * publishable column without going through the product/registration
 * validators.
 */
// Cost and latency control: the model never sees the stored original. A
// downscaled, metadata-stripped JPEG is produced for analysis only.
exports.MAX_ANALYSIS_DIMENSION = 1024;
exports.ANALYSIS_JPEG_QUALITY = 72;
async function prepareImageForAnalysis(bytes) {
    if (!bytes || bytes.length === 0)
        return null;
    try {
        const out = await (0, sharp_1.default)(Buffer.from(bytes))
            .rotate() // honour EXIF orientation before stripping it
            .resize({
            width: exports.MAX_ANALYSIS_DIMENSION,
            height: exports.MAX_ANALYSIS_DIMENSION,
            fit: 'inside',
            withoutEnlargement: true,
        })
            .jpeg({ quality: exports.ANALYSIS_JPEG_QUALITY })
            .toBuffer();
        return { base64: out.toString('base64'), mimeType: 'image/jpeg' };
    }
    catch {
        return null;
    }
}
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function readField(value) {
    if (value && typeof value === 'object' && !Array.isArray(value))
        return value;
    // Tolerate a bare scalar where the model ignored the object shape.
    if (typeof value === 'string' || typeof value === 'number')
        return { value };
    return {};
}
function clampConfidence(value) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return 0;
    const scaled = n > 1 && n <= 100 ? n / 100 : n;
    return Math.min(Math.max(scaled, 0), 1);
}
function readString(value, maxLength = 500) {
    if (typeof value !== 'string')
        return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
function readStringArray(value, maxItems = 20, maxLength = 120) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((entry) => readString(entry, maxLength))
        .filter(Boolean)
        .slice(0, maxItems);
}
/**
 * Low-confidence values must not be presented as facts (brief §9.7). Anything
 * under the threshold is reported as missing so the seller is asked.
 */
exports.CONFIDENCE_USABLE = 0.5;
function isUsable(field) {
    return !!field.value && field.confidence >= exports.CONFIDENCE_USABLE;
}
