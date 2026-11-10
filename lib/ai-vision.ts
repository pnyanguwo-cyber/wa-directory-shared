import sharp from 'sharp'

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
export const MAX_ANALYSIS_DIMENSION = 1024
export const ANALYSIS_JPEG_QUALITY = 72

export interface PreparedImage {
  base64: string
  mimeType: string
}

export async function prepareImageForAnalysis(bytes: Uint8Array): Promise<PreparedImage | null> {
  if (!bytes || bytes.length === 0) return null
  try {
    const out = await sharp(Buffer.from(bytes))
      .rotate() // honour EXIF orientation before stripping it
      .resize({
        width: MAX_ANALYSIS_DIMENSION,
        height: MAX_ANALYSIS_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: ANALYSIS_JPEG_QUALITY })
      .toBuffer()
    return { base64: out.toString('base64'), mimeType: 'image/jpeg' }
  } catch {
    return null
  }
}

/** Reads { value, confidence, evidence, ... } shapes defensively. */
export interface RawField {
  value?: unknown
  confidence?: unknown
  evidence?: unknown
  needs_confirmation?: unknown
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function readField(value: unknown): RawField {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as RawField
  // Tolerate a bare scalar where the model ignored the object shape.
  if (typeof value === 'string' || typeof value === 'number') return { value }
  return {}
}

export function clampConfidence(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  const scaled = n > 1 && n <= 100 ? n / 100 : n
  return Math.min(Math.max(scaled, 0), 1)
}

export function readString(value: unknown, maxLength = 500): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

export function readStringArray(value: unknown, maxItems = 20, maxLength = 120): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => readString(entry, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

/**
 * Low-confidence values must not be presented as facts (brief §9.7). Anything
 * under the threshold is reported as missing so the seller is asked.
 */
export const CONFIDENCE_USABLE = 0.5

export function isUsable(field: { value: string; confidence: number }): boolean {
  return !!field.value && field.confidence >= CONFIDENCE_USABLE
}