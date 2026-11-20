"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HERO_WASH_DEFAULT = void 0;
exports.imageLuminanceFromBytes = imageLuminanceFromBytes;
exports.imageLuminanceFromUrl = imageLuminanceFromUrl;
exports.washForLuminance = washForLuminance;
const sharp_1 = __importDefault(require("sharp"));
// Average perceived luminance of an image, computed server-side with sharp
// (24x24 grayscale). Feeds the auto-site hero scrim: bright covers get a
// deeper wash so the headline stays WCAG-readable, dark covers get a lighter
// touch so saturated photos are not dulled. NULL/unknown → default scrim.
async function imageLuminanceFromBytes(bytes) {
    try {
        const { data } = await (0, sharp_1.default)(Buffer.from(bytes))
            .resize(24, 24, { fit: 'inside' })
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });
        if (!data.length)
            return null;
        let sum = 0;
        for (let i = 0; i < data.length; i++)
            sum += data[i];
        const lum = sum / data.length / 255;
        return Number.isFinite(lum) ? Math.min(1, Math.max(0, lum)) : null;
    }
    catch {
        return null;
    }
}
async function imageLuminanceFromUrl(url) {
    try {
        if (!/^https:\/\//.test(url) || url.length > 2048)
            return null;
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok)
            return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length === 0 || bytes.length > 12 * 1024 * 1024)
            return null;
        return await imageLuminanceFromBytes(bytes);
    }
    catch {
        return null;
    }
}
exports.HERO_WASH_DEFAULT = { scrimL: 0.65, scrimM: 0.45, scrimB: 0.5 };
// Map cover luminance [0..1] to scrim opacities. Tiers chosen so the white
// headline column stays above 4.5:1 contrast on each span of the range.
function washForLuminance(lum) {
    if (lum == null)
        return exports.HERO_WASH_DEFAULT;
    if (lum < 0.35)
        return { scrimL: 0.5, scrimM: 0.32, scrimB: 0.42 }; // dark photo
    if (lum > 0.62)
        return { scrimL: 0.78, scrimM: 0.6, scrimB: 0.58 }; // bright photo
    return exports.HERO_WASH_DEFAULT;
}
