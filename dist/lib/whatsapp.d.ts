type OutboundLogger = (to: string, kind: string, body: string) => void;
export declare function setOutboundLogger(logger: OutboundLogger | null): void;
export declare function sendWhatsAppMessage(to: string, message: string, replyTo?: string): Promise<boolean>;
export declare function markRead(messageId: string, typing?: boolean): Promise<void>;
export declare function sendLocationRequest(to: string, body: string): Promise<void>;
export declare function sendContactCard(to: string, name: string, phone: string): Promise<void>;
export declare function sendReaction(to: string, messageId: string, emoji: string): Promise<void>;
export interface InteractiveRow {
    id: string;
    title: string;
    description?: string;
}
export interface InteractiveButton {
    id: string;
    title: string;
}
/**
 * CTA-URL message: body text with one native button that opens a link.
 * Some WhatsApp Business Accounts don't support cta_url yet (recent rollout),
 * so a failure degrades to plain text carrying the same (short) link.
 */
export declare function sendCtaUrl(to: string, body: string, displayText: string, url: string): Promise<void>;
/** List message: a body plus a button that opens tappable rows. */
export declare function sendInteractiveList(to: string, body: string, rows: InteractiveRow[], buttonLabel?: string, replyTo?: string): Promise<void>;
/** Button message: a body with up to three quick-reply buttons. */
export declare function sendInteractiveButtons(to: string, body: string, buttons: InteractiveButton[], replyTo?: string): Promise<void>;
/**
 * Product card: image + body + quick-reply buttons in ONE interactive
 * message, so the button always travels with the picture. Degrades to the
 * image/caption (then buttons) path when the interactive post fails.
 */
export declare function sendInteractiveImageCard(to: string, body: string, imageUrl: string | null, buttons: InteractiveButton[]): Promise<void>;
export declare function sendWhatsAppTemplate(to: string, templateName: string, params?: string[], language?: string): Promise<boolean>;
/** Document message (CSV exports etc.): upload the file to Meta's media API,
 * then reference it by media id. Dry-run logs instead of uploading. */
export declare function sendWhatsAppDocument(to: string, filename: string, mime: string, content: string | Buffer): Promise<boolean>;
/**
 * Send an image message via WhatsApp Cloud API.
 * Uses the image URL directly (no upload needed) — accepts public URLs.
 * Caption supports up to 1024 characters.
 */
export declare function sendWhatsAppImage(to: string, imageUrl: string, caption: string, replyTo?: string): Promise<boolean>;
/**
 * Sends an image message, falling back to a plain text message when the
 * image send fails (so the customer always receives content).
 * Returns true when the image was actually sent.
 */
export declare function sendImageWithFallback(to: string, imageUrl: string, caption: string, replyTo?: string): Promise<boolean>;
export {};
//# sourceMappingURL=whatsapp.d.ts.map