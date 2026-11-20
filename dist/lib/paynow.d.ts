export interface PaynowInitResult {
    ok: boolean;
    error?: string;
    instructions?: string;
    pollUrl?: string;
    paynowReference?: string;
    redirectUrl?: string;
}
export interface PaynowStatusResult {
    ok: boolean;
    error?: string;
    status: string;
    paid: boolean;
    paynowReference?: string;
}
export declare function paynowConfigured(): boolean;
export declare function verifyHash(values: Record<string, string>, integrationKey: string): boolean;
export declare function parseUrlencoded(body: string): Record<string, string>;
export declare function normalizeEcoCashPhone(raw: string): string;
export declare function isEconetNumber(phone: string): boolean;
export declare function initiateEcoCashPayment(opts: {
    reference: string;
    amount: number;
    phone: string;
    email?: string;
    additionalInfo?: string;
    resultUrl?: string;
    returnUrl?: string;
}): Promise<PaynowInitResult>;
export declare function pollTransactionStatus(pollUrl: string): Promise<PaynowStatusResult>;
//# sourceMappingURL=paynow.d.ts.map