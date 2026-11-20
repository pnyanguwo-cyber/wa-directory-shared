export type PaymentEventOutcome = 'ok' | 'error' | 'rejected' | 'pending';
export interface PaymentEventInput {
    eventType: string;
    outcome?: PaymentEventOutcome;
    bidId?: string | null;
    businessId?: string | null;
    detail?: Record<string, unknown>;
    request?: Request;
}
export declare function logPaymentEvent(input: PaymentEventInput): Promise<void>;
//# sourceMappingURL=payment-events.d.ts.map