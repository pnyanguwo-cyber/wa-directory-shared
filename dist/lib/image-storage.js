"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_LOGO_BYTES = void 0;
exports.sniffImage = sniffImage;
exports.uploadLogoImage = uploadLogoImage;
const supabase_server_js_1 = require("./supabase-server.js");
const SIGNATURES = [
    { ext: 'png', type: 'image/png', test: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
    { ext: 'jpg', type: 'image/jpeg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    {
        ext: 'webp',
        type: 'image/webp',
        test: b => b.length >= 12 &&
            b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // "RIFF"
            b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50, // "WEBP"
    },
];
exports.MAX_LOGO_BYTES = 2 * 1024 * 1024;
function sniffImage(bytes) {
    return SIGNATURES.find(s => s.test(bytes)) || null;
}
async function uploadLogoImage(bytes) {
    try {
        if (bytes.length === 0 || bytes.length > exports.MAX_LOGO_BYTES)
            return null;
        const match = sniffImage(bytes);
        if (!match)
            return null;
        const fileName = `public/${Date.now()}_${Math.random().toString(36).slice(2)}.${match.ext}`;
        const supabase = (0, supabase_server_js_1.getSupabase)();
        const { error: uploadError } = await supabase.storage
            .from('logos')
            .upload(fileName, bytes, { contentType: match.type, upsert: false });
        if (uploadError)
            throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(fileName);
        return publicUrl || null;
    }
    catch {
        return null;
    }
}
