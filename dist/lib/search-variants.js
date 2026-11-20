"use strict";
// ── Search spelling variants ─────────────────────────────────────────────
// Zimbabwe writes British English, but customers (and business owners)
// type both spellings: "fertiliser" vs "fertilizer", "tyre" vs "tire",
// "centre" vs "center". Search used to be a literal ILIKE, so a listing
// spelled one way was invisible to the other. This module turns a term
// into the small set of spellings a searcher might mean, so callers can
// OR them into their filters and show "Showing results for …" when the
// original spelling found nothing.
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchVariants = searchVariants;
exports.matchesSearchTerm = matchesSearchTerm;
exports.preferredVariant = preferredVariant;
// Whole-word pairs that no rule can derive safely.
const SPELLING_PAIRS = [
    ['tyre', 'tire'],
    ['kerb', 'curb'],
    ['plough', 'plow'],
    ['mould', 'mold'],
    ['smoulder', 'smolder'],
    ['draught', 'draft'],
    ['aluminium', 'aluminum'],
    ['grey', 'gray'],
    ['cheque', 'check'],
    ['programme', 'program'],
    ['sulphur', 'sulfur'],
    ['storey', 'story'],
    ['moustache', 'mustache'],
    ['pyjamas', 'pajamas'],
    ['aeroplane', 'airplane'],
    ['judgement', 'judgment'],
    ['ageing', 'aging'],
    ['enrol', 'enroll'],
    ['fulfil', 'fulfill'],
    ['skilful', 'skillful'],
    ['wilful', 'willful'],
    ['instalment', 'installment'],
    ['jewellery', 'jewelry'],
    ['marvellous', 'marvelous'],
    ['counselling', 'counseling'],
    ['travelled', 'traveled'],
    ['traveller', 'traveler'],
    ['travelling', 'traveling'],
    ['cancelled', 'canceled'],
    ['cancelling', 'canceling'],
    ['labelled', 'labeled'],
    ['labelling', 'labeling'],
    ['modelled', 'modeled'],
    ['modelling', 'modeling'],
    ['fuelled', 'fueled'],
    ['fuelling', 'fueling'],
    ['levelled', 'leveled'],
    ['signalled', 'signaled'],
    ['dialled', 'dialed'],
    ['totalled', 'totaled'],
    ['anaemia', 'anemia'],
    ['paediatric', 'pediatric'],
    ['gynaecology', 'gynecology'],
    ['diarrhoea', 'diarrhea'],
    ['oestrogen', 'estrogen'],
    ['foetus', 'fetus'],
    ['oesophagus', 'esophagus'],
    ['orthopaedic', 'orthopedic'],
    ['archaeology', 'archeology'],
    ['mediaeval', 'medieval'],
    ['manoeuvre', 'maneuver'],
    ['haemorrhage', 'hemorrhage'],
    ['leukaemia', 'leukemia'],
    ['catalogue', 'catalog'],
    ['dialogue', 'dialog'],
    ['analogue', 'analog'],
    ['centre', 'center'],
    ['metre', 'meter'],
    ['litre', 'liter'],
    ['theatre', 'theater'],
    ['fibre', 'fiber'],
    ['calibre', 'caliber'],
    ['sombre', 'somber'],
    ['spectre', 'specter'],
    ['lustre', 'luster'],
    ['colour', 'color'],
    ['favour', 'favor'],
    ['favourite', 'favorite'],
    ['behaviour', 'behavior'],
    ['labour', 'labor'],
    ['neighbour', 'neighbor'],
    ['honour', 'honor'],
    ['humour', 'humor'],
    ['flavour', 'flavor'],
    ['rumour', 'rumor'],
    ['armour', 'armor'],
    ['harbour', 'harbor'],
    ['odour', 'odor'],
    ['vapour', 'vapor'],
    ['endeavour', 'endeavor'],
    ['savour', 'savor'],
    ['tumour', 'tumor'],
    ['vigour', 'vigor'],
    ['glamour', 'glamor'],
    ['defence', 'defense'],
    ['offence', 'offense'],
    ['licence', 'license'],
    ['pretence', 'pretense'],
    ['practise', 'practice'],
];
// -ise verbs that are NOT Americanised: "size" must never become "sise".
const ISE_EXCEPTIONS = new Set([
    'wise', 'size', 'prize', 'rise', 'guise', 'noise', 'poise', 'bruise',
    'cruise', 'surprise', 'comprise', 'exercise', 'merchandise', 'franchise',
    'premise', 'promise', 'compromise', 'expertise', 'likewise', 'clockwise',
    'otherwise', 'advise', 'devise', 'revise', 'supervise', 'improvise',
    'televise', 'denise', 'anise', 'treatise', 'paradise', 'merchandise',
]);
const ISE_TO_IZE = {
    isation: 'ization',
    isations: 'izations',
    ising: 'izing',
    ised: 'ized',
    ises: 'izes',
    isers: 'izers',
    iser: 'izer',
    ise: 'ize',
};
const IZE_TO_ISE = {
    ization: 'isation',
    izations: 'isations',
    izing: 'ising',
    ized: 'ised',
    izes: 'ises',
    izers: 'isers',
    izer: 'iser',
    ize: 'ise',
};
const YSE_TO_YSE = {
    yse: 'yze',
    ysed: 'yzed',
    yses: 'yzes',
    ysing: 'yzing',
};
const YZE_TO_YSE = {
    yze: 'yse',
    yzed: 'ysed',
    yzes: 'yses',
    yzing: 'ysing',
};
const SUFFIXES = ['s', 'es', 'ed', 'ing', 'er', 'ers', 'ful', 'less', 'able', 'ably', 'ment', 'ments'];
const cache = new Map();
function applySuffixPair(word, from) {
    for (const [suffix, replacement] of Object.entries(from)) {
        if (word.endsWith(suffix)) {
            const stem = word.slice(0, -suffix.length);
            if (stem.length >= 4)
                return stem + replacement;
        }
    }
    return null;
}
/** All plausible spellings of one word, best first (the word itself excluded). */
function wordVariants(word) {
    const out = new Set();
    for (const [brit, amer] of SPELLING_PAIRS) {
        if (word === brit)
            out.add(amer);
        else if (word === amer)
            out.add(brit);
        else if (word.startsWith(brit))
            out.add(amer + word.slice(brit.length));
        else if (word.startsWith(amer))
            out.add(brit + word.slice(amer.length));
    }
    if (!ISE_EXCEPTIONS.has(word)) {
        const ize = applySuffixPair(word, ISE_TO_IZE);
        if (ize)
            out.add(ize);
        const ise = applySuffixPair(word, IZE_TO_ISE);
        if (ise)
            out.add(ise);
    }
    const yze = applySuffixPair(word, YSE_TO_YSE);
    if (yze)
        out.add(yze);
    const yse = applySuffixPair(word, YZE_TO_YSE);
    if (yse)
        out.add(yse);
    // Plain plural/singular: "fertilisers" ↔ "fertiliser".
    if (word.length >= 5) {
        if (word.endsWith('s') && !/(ss|us|is)$/.test(word))
            out.add(word.slice(0, -1));
        else if (!word.endsWith('s'))
            out.add(word + 's');
    }
    out.delete(word);
    return Array.from(out).filter(Boolean);
}
/**
 * Spelling variants of a search term, ready to OR into ILIKE filters.
 * Multi-word queries swap one word at a time (plus the fully swapped
 * phrase) so "organic fertilizer" also tries "organic fertiliser".
 */
function searchVariants(term) {
    const base = (term || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!base)
        return [];
    const cached = cache.get(base);
    if (cached)
        return cached;
    const words = base.split(' ');
    const perWord = words.map(wordVariants);
    const out = new Set();
    // One word swapped at a time, then everything swapped.
    perWord.forEach((variants, i) => {
        for (const v of variants) {
            const copy = [...words];
            copy[i] = v;
            out.add(copy.join(' '));
        }
    });
    if (perWord.every(v => v.length > 0)) {
        out.add(words.map((w, i) => perWord[i][0]).join(' '));
    }
    out.delete(base);
    const list = Array.from(out).slice(0, 12);
    if (cache.size > 500)
        cache.clear();
    cache.set(base, list);
    return list;
}
/** True when the text contains the term or one of its spelling variants. */
function matchesSearchTerm(text, term) {
    const hay = (text || '').toLowerCase();
    const t = (term || '').trim().toLowerCase();
    if (!hay || !t)
        return false;
    if (hay.includes(t))
        return true;
    return searchVariants(t).some(v => hay.includes(v));
}
/** Best-looking alternative spelling for display in "did you mean" copy. */
function preferredVariant(term, haystacks) {
    for (const v of searchVariants(term)) {
        if (haystacks.some(h => (h || '').toLowerCase().includes(v)))
            return v;
    }
    return null;
}
