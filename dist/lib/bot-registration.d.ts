/**
 * WhatsApp business registration — plan choice → image-first → review.
 *
 * Entry order (deliberate):
 *   1. Choose how to activate: 90-day free trial or USD 2/month paid.
 *   2. Offer to upload a business card / flyer / banner / advert (image-first).
 *      The user may explicitly skip and enter details manually.
 *   3. Only after (2) do we ask the registration questions.
 *
 * The old registration handler can never start before the image-first step
 * has been completed or skipped: every state transition below goes through
 * REGISTRATION_STARTED → REGISTRATION_AWAITING_IMAGE → collecting/review.
 *
 * The native WhatsApp Flow is intentionally NOT launched from this entry
 * point. A published Flow ID can be an older form (the "Question 1 of 11"
 * experience), which would bypass the upload step entirely. The Flow data
 * exchange endpoint remains available, but chat registration is the
 * deterministic path.
 */
import { type TrialStatus } from '../types/index.js';
export declare const REGISTRATION_BUTTONS: {
    readonly upload: "reg_upload";
    readonly skip: "reg_skip";
    readonly proceed: "reg_proceed";
    readonly edit: "reg_edit";
    readonly planTrial: "reg_plan_trial";
    readonly planPaid: "reg_plan_paid";
    readonly publish: "reg_publish";
    readonly cancel: "reg_cancel";
    readonly talkAdmin: "reg_talk_admin";
    readonly askAdminPermission: "reg_ask_admin_permission";
    readonly changePhone: "reg_change_phone";
};
/** Pick the trial or paid plan, then immediately offer the upload step. */
export declare function chooseRegistrationPlan(phone: string, choice: string): Promise<boolean>;
/**
 * Entry point. Resumes an in-progress registration instead of creating a
 * second session; otherwise starts with the plan choice.
 */
export declare function startRegistrationFlow(phone: string, opts?: {
    force?: boolean;
}): Promise<void>;
export declare function handleRegistrationMessage(phone: string, text: string, context: any): Promise<void>;
export declare function handleRegistrationImage(phone: string, imageBytes: Uint8Array, caption: string): Promise<void>;
/** Exported for the webhook's Flow-completion path and tests. */
export declare function registrationPlanForTrial(status?: TrialStatus | null): boolean;
//# sourceMappingURL=bot-registration.d.ts.map