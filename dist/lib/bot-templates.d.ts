import type { InteractiveRow } from './whatsapp.js';
export declare const CHAT_OPEN_MARKER = "opened your chat";
/**
 * WhatsApp inline-code price: `$1.50` renders monospace in the client.
 */
export declare function monoUSD(price: number): string;
/**
 * Wraps a free-form database price string ("$5–$40", "From $10") in the same
 * monospace price treatment. Empty input renders as nothing.
 */
export declare function monoPrice(raw: string | null | undefined): string;
export interface ResultCard {
    id: string;
    name: string;
    city: string | null;
    area: string | null;
    km?: number | null;
    item: {
        name: string;
        price: number | null;
        id?: string;
        image_url?: string | null;
    } | null;
    priceRange: string | null;
    verified?: boolean;
    paymentStatus?: string;
    rating?: number;
    reviewCount?: number;
    responseTimeMinutes?: number;
    ordersFulfilled?: number;
    escrowEligible?: boolean;
}
export declare function displayLocation(city: string | null, area?: string | null): string;
/**
 * Search results message. `cityLabel` null means the search was nationwide.
 */
export declare function renderResultsMessage(termDisplay: string, cityLabel: string | null, cards: ResultCard[]): string;
/**
 * Nearby-town results message (the requested town had no verified matches).
 */
export declare function renderNearbyMessage(termDisplay: string, city: string, cards: ResultCard[]): string;
export interface DetailData {
    name: string;
    slug: string | null;
    city: string | null;
    area: string | null;
    rating: number;
    reviewCount: number | null;
    /** Up to 3 active items for this business. */
    items: {
        name: string;
        price: number | null;
    }[];
    phone: string | null;
    /** 'whatsapp' | 'voice' | null */
    phoneType: string | null;
    /** Social links (personal contacts carry these). */
    socials?: string[];
    verified?: boolean;
    paymentStatus?: string;
    responseTimeMinutes?: number;
    ordersFulfilled?: number;
    escrowEligible?: boolean;
    website?: string | null;
    /** Business has a generated mini-site (gated to active paid plans). */
    generateSite?: boolean;
}
/** Readable phone display: +263 772 234 002. */
export declare function formatPhone(raw: string | null | undefined): string;
/** The /go redirect: logs attribution + transcript marker, then opens the
 * business WhatsApp chat with the prefill text. */
export declare function chatCtaUrl(businessId: string, customerPhone: string): string;
/** Body for the native chat button that follows the detail card. */
export declare function renderChatPrompt(name: string): string;
/**
 * Business details card. Omits fields that are not available; contact lines
 * adapt to the listing (voice-only numbers get a call line, missing numbers
 * fall back to the listing page).
 */
export declare function renderDetailCard(b: DetailData): string;
export interface VerifyGroup {
    businessName: string;
    city?: string;
    lines: {
        name: string;
        qty: number;
        price: number | null;
    }[];
}
/** Verify screen of the typed order: everything matched, grouped per shop,
 * with a grand total when every line carries a price. */
export declare function renderOrderVerify(groups: VerifyGroup[], footer?: string): string;
/** Post-commit receipt: what went out, where, and which shops are quiet. */
export declare function renderOrderSent(rows: {
    businessName: string;
    status: string;
    token: string;
    dmOk: boolean | null;
}[]): string;
/** Buyer-side "my orders" tracker. */
export declare function renderMyOrders(rows: {
    biz_name: string;
    status: string;
    token: string;
    total?: number;
    counter?: 'pending' | 'accepted' | 'declined' | null;
}[]): string;
/** Empty results / no supply message. */
export interface NeedDraft {
    item: string;
    qty: string;
    budget: string;
    city: string;
}
export declare function renderNeedIntro(): string;
export declare function renderNeedConfirm(d: NeedDraft): string;
export declare function renderNeedPosted(rqId: string, d: NeedDraft): string;
export declare function renderQuoteCard(rqId: string, supplierName: string, price: string, body: string, index: number, total: number, website?: string | null): string;
export declare function renderNeedSilence(rqId: string): string;
export declare function renderNeedClosedByBuyer(rqId: string): string;
export declare function renderNeedFilled(rqId: string, when: string, winner: string): string;
export declare function renderDealAsk(rqId: string): string;
export declare function renderCeremony(rqId: string, item: string, quoteLines: string[]): string;
export declare function renderEmptyResults(term: string): string;
export declare function renderInvalidSelection(count: number): string;
/** Body for the native list-message version of the results screen. */
export declare function renderResultsListBody(termDisplay: string, cityLabel: string | null, count: number, page?: number): string;
export declare const RESULTS_PER_PAGE = 9;
/** Tappable rows for one results page: up to 9 businesses numbered
 * absolutely (page 2 starts at 10.), plus a trailing status row —
 * "→ More results…" when a next page exists, "✔ End of list" otherwise. */
export declare function resultRows(cards: ResultCard[], page?: number): InteractiveRow[];
/** Main menu (opened by menu). Rows are by convention in route.
 * The body doubles as the search how-to: the directory has no separate
 * "search" entry point — typing IS searching. */
export declare function renderMainMenuBody(): string;
/** Greeting-only messages ("hi", "showed up" first contact): mirror the
 * caller's greeting word, then teach the two ways to find things. The menu
 * lives behind *menu*; this text is the brand-new contact's whole world. */
export declare function renderWelcomeInstructions(greeting?: string): string;
/** Full first-contact welcome (owner-approved copy). The interactive menu is
 * attached to THIS message as the list body (menu below the text). */
export declare function renderFirstWelcome(name?: string, channelLink?: string): string;
/** Returning customers get a short, time-based greeting (owner-approved
 * copy). Harare is UTC+2 all year (CAT) — computed from server UTC time. */
export declare function renderWelcomeBack(name?: string): string;
/** One-time pitch for just-registered businesses: the WhatsApp channel is
 * where live buyer needs surface. Free-form, sent while the 24h window is open. */
export declare function renderChannelPitch(channelLink: string): string;
export declare function renderGreetingBody(text: string, name?: string): string | null;
/** Body for the nearby-towns results screen as a native list message. */
export declare function renderNearbyListBody(termDisplay: string, city: string, count: number, page?: number): string;
/** Body for distance-ranked results from a shared location ("📍 Near me").
 * Rows carry a "~N km" badge; copy should never say "nearest", the whole
 * screen IS the nearest. */
export declare function renderNearMeListBody(termDisplay: string, count: number, page?: number): string;
/** Safe outbound error note shown to customers (rare; nothing is exposed). */
export declare function renderErrorCard(): string;
export declare function FALLBACK_HELP_LINES(siteUrl: string, channelLink?: string): string[];
export declare function SUPPLIER_HELP_LINES(siteUrl: string, channelLink?: string): string[];
//# sourceMappingURL=bot-templates.d.ts.map