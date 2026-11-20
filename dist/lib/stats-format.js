"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAT_EVENT_COLORS = exports.STAT_EVENT_LABELS = void 0;
exports.getEventLabel = getEventLabel;
exports.csvEscape = csvEscape;
exports.STAT_EVENT_LABELS = {
    profile_view: 'Profile views',
    click_whatsapp: 'WhatsApp clicks',
    click_call: 'Call clicks',
    click_website: 'Website clicks',
    impression: 'Search impressions',
    qr_scan: 'QR scans',
    bot_search: 'Bot search hits',
    bot_chat_open: 'Bot chat opens',
    share_bot: 'Bot shares',
    share_web: 'Web shares',
};
exports.STAT_EVENT_COLORS = {
    profile_view: '#25d366',
    click_whatsapp: '#128c7e',
    click_website: '#34b7f1',
    impression: '#a7c957',
    qr_scan: '#8338ec',
    bot_search: '#f4a261',
    bot_chat_open: '#e76f51',
    share_web: '#2a9d8f',
    share_bot: '#e9c46a',
    click_call: '#6d6875',
};
function getEventLabel(type) {
    return exports.STAT_EVENT_LABELS[type] || type;
}
function csvEscape(value) {
    const s = String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
