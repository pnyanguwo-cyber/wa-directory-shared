import { type PlanType } from '../types/index.js';
import type { PaymentEventOutcome } from './payment-events.js';
export interface CreateListingPaymentInput {
    businessId: string;
    payerPhone: string;
    plan: PlanType;
    hasProAssistance?: boolean;
    amountOverride?: number;
}
export interface PaymentAdapters {
    initiateEcoCashPayment?: (params: {
        reference: string;
        amount: number;
        phone: string;
        additionalInfo: string;
        resultUrl: string;
        returnUrl?: string;
    }) => Promise<{
        ok: boolean;
        pollUrl?: string;
        paynowReference?: string;
        instructions?: string;
        error?: string;
    }>;
    logPaymentEvent?: (params: {
        eventType: string;
        outcome?: PaymentEventOutcome;
        businessId: string;
        detail?: Record<string, unknown>;
        request?: Request;
    }) => Promise<void>;
    sendWhatsAppMessage?: (phone: string, text: string) => Promise<void>;
}
export type CreateListingPaymentResult = {
    ok: true;
    autoEcoCash: boolean;
    instructions: string | null;
    message: string;
} | {
    ok: false;
    status: number;
    error: string;
};
export declare function paymentAmountFor(plan: PlanType, hasProAssistance?: boolean): number;
export declare function createListingPayment(input: CreateListingPaymentInput, adapters?: PaymentAdapters): Promise<CreateListingPaymentResult>;
//# sourceMappingURL=listing-pay.d.ts.map