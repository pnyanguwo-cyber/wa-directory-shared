/**
 * Admin WhatsApp notices with up to three quick-reply buttons.
 *
 * WhatsApp's button message carries at most three reply buttons; everything
 * else stays a typed command. Button ids are exactly the command we would have
 * typed (`verify <name>`, `trial <name>`, `pending`), so a tap runs the same
 * handler as the text - no second code path to keep in sync.
 */
import { type InteractiveButton } from './whatsapp.js';
export type AdminNoticeButton = InteractiveButton;
/**
 * The three things an admin does with a freshly submitted listing.
 *
 * `verify <name>` carries no day count on purpose: the bot then checks whether
 * the owner asked for the 90-day free trial and starts that trial, otherwise
 * it grants the usual 30 days. Typing `verify <name> 30` would force the
 * 30-day grant and leave a trial request pending.
 */
export declare function pendingVerificationButtons(businessName: string): AdminNoticeButton[];
/** Same actions for a location/category request raised by a submission. */
export declare function reviewRequestButtons(businessName: string): AdminNoticeButton[];
/**
 * Send an admin notice as buttons, falling back to plain text (with the
 * commands spelled out) when Meta rejects the interactive payload.
 */
export declare function sendAdminNotice(phone: string | undefined, body: string, buttons?: AdminNoticeButton[]): Promise<void>;
/** Body for a new submission, with the dashboard link kept in the text. */
export declare function submissionNoticeBody(fields: {
    title: string;
    name: string;
    code: string;
    category: string;
    location: string;
    phone: string;
    extra?: string[];
}): string;
//# sourceMappingURL=admin-notice.d.ts.map