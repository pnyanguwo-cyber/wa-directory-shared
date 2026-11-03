import { getSupabase } from './supabase-server.js'

// Image intake shared by the webapp upload API and the WhatsApp bot: the
// bytes are sniffed by magic bytes (never trusting client MIME/filename),
// then stored in the public 'logos' storage bucket. Returns the public URL
// or null on any failure — callers own their fallback copy.

interface ImageSignature { ext: string; type: string; test: (b: Uint8Array) => boolean }

const SIGNATURES: ImageSignature[] = [
  { ext: 'png', type: 'image/png', test: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: 'jpg', type: 'image/jpeg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: 'webp',
    type: 'image/webp',
    test: b =>
      b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // "RIFF"
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50, // "WEBP"
  },
]

export const MAX_LOGO_BYTES = 2 * 1024 * 1024

export function sniffImage(bytes: Uint8Array): ImageSignature | null {
  return SIGNATURES.find(s => s.test(bytes)) || null
}

export async function uploadLogoImage(bytes: Uint8Array): Promise<string | null> {
  try {
    if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) return null
    const match = sniffImage(bytes)
    if (!match) return null

    const fileName = `public/${Date.now()}_${Math.random().toString(36).slice(2)}.${match.ext}`
    const supabase = getSupabase()

    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(fileName, bytes, { contentType: match.type, upsert: false })
    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(fileName)
    return publicUrl || null
  } catch {
    return null
  }
}