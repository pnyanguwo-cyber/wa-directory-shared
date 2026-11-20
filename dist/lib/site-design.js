"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SITE_DESIGN_KEYS = exports.SITE_FONT_KEYS = exports.SITE_FONTS = exports.SITE_DESIGNS = exports.SITE_DESIGN_DEFAULT = void 0;
exports.getPreset = getPreset;
exports.getFontMeta = getFontMeta;
exports.SITE_DESIGN_DEFAULT = 'classic';
exports.SITE_DESIGNS = [
    {
        key: 'classic',
        label: 'Classic',
        desc: 'The flagship WA Directory look — wash hero, frosted tiles.',
        defaultFont: 'modern',
        radiusPill: 'rounded-2xl',
        radiusCard: 'rounded-2xl',
        radiusTile: 'rounded-3xl',
        heroVariant: 'wash',
        centeredHero: false,
        sectionRule: '',
    },
    {
        key: 'maison',
        label: 'Maison',
        desc: 'Editorial luxury — serif display, centered hero, thin rules.',
        defaultFont: 'editorial',
        radiusPill: 'rounded-full',
        radiusCard: 'rounded-lg',
        radiusTile: 'rounded-lg',
        heroVariant: 'editorial',
        centeredHero: true,
        sectionRule: 'border-t border-black/[0.08]',
    },
    {
        key: 'bolt',
        label: 'Bolt',
        desc: 'Bold conversion — huge headline, stat chips, chunky cards.',
        defaultFont: 'grotesk',
        radiusPill: 'rounded-full',
        radiusCard: 'rounded-3xl',
        radiusTile: 'rounded-2xl',
        heroVariant: 'bold',
        centeredHero: false,
        sectionRule: '',
    },
    {
        key: 'craft',
        label: 'Craft',
        desc: 'Warm market feel — photo collage hero, tilted badges, soft pills.',
        defaultFont: 'warm',
        radiusPill: 'rounded-full',
        radiusCard: 'rounded-[1.75rem]',
        radiusTile: 'rounded-2xl',
        heroVariant: 'warm',
        centeredHero: false,
        sectionRule: '',
    },
];
function getPreset(key) {
    return exports.SITE_DESIGNS.find(d => d.key === key) || exports.SITE_DESIGNS[0];
}
// ---- Font pairs (loaded server-side via next/font in the template) --------
exports.SITE_FONTS = [
    { key: 'modern', label: 'Modern Sans', desc: 'Inter — the WA Directory system look' },
    { key: 'editorial', label: 'Editorial Serif', desc: 'Playfair Display + Inter' },
    { key: 'grotesk', label: 'Grotesk', desc: 'Space Grotesk + Inter' },
    { key: 'warm', label: 'Warm Serif', desc: 'DM Serif Display + DM Sans' },
];
exports.SITE_FONT_KEYS = exports.SITE_FONTS.map(f => f.key);
exports.SITE_DESIGN_KEYS = exports.SITE_DESIGNS.map(d => d.key);
function getFontMeta(key) {
    return exports.SITE_FONTS.find(f => f.key === key) || exports.SITE_FONTS[0];
}
