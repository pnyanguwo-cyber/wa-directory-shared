"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fontWarmBody = exports.fontWarmHead = exports.fontGroteskBody = exports.fontGroteskHead = exports.fontEditorialBody = exports.fontEditorialHead = exports.fontModernBody = exports.fontModernHead = void 0;
exports.getFontPair = getFontPair;
const google_1 = require("next/font/google");
exports.fontModernHead = (0, google_1.Inter)({ subsets: ['latin'], display: 'swap' });
exports.fontModernBody = (0, google_1.Inter)({ subsets: ['latin'], display: 'swap' });
exports.fontEditorialHead = (0, google_1.Playfair_Display)({ subsets: ['latin'], display: 'swap', weight: ['500', '700'] });
exports.fontEditorialBody = (0, google_1.Inter)({ subsets: ['latin'], display: 'swap' });
exports.fontGroteskHead = (0, google_1.Space_Grotesk)({ subsets: ['latin'], display: 'swap' });
exports.fontGroteskBody = (0, google_1.Inter)({ subsets: ['latin'], display: 'swap' });
exports.fontWarmHead = (0, google_1.DM_Serif_Display)({ subsets: ['latin'], display: 'swap', weight: ['400'] });
exports.fontWarmBody = (0, google_1.DM_Sans)({ subsets: ['latin'], display: 'swap' });
function getFontPair(key) {
    switch (key) {
        case 'editorial':
            return { head: exports.fontEditorialHead.style.fontFamily, body: exports.fontEditorialBody.style.fontFamily, headVars: 'var(--font-playfair)' };
        case 'grotesk':
            return { head: exports.fontGroteskHead.style.fontFamily, body: exports.fontGroteskBody.style.fontFamily, headVars: '' };
        case 'warm':
            return { head: exports.fontWarmHead.style.fontFamily, body: exports.fontWarmBody.style.fontFamily, headVars: '' };
        default:
            return { head: exports.fontModernHead.style.fontFamily, body: exports.fontModernBody.style.fontFamily, headVars: '' };
    }
}
