declare function normalizePhone(phone: string): string;
export interface CookieAdapterLike {
    get(name: string): string | undefined;
    set?(name: string, value: string, options: {
        httpOnly: boolean;
        sameSite: 'lax' | 'strict' | 'none';
        secure: boolean;
        path: string;
    }): void;
    delete?(name: string): void;
}
export declare function signBusinessToken(businessId: string): string;
export declare function verifyBusinessToken(token: string): string | null;
export declare function setBusinessSession(businessId: string, cookies: CookieAdapterLike | undefined): void;
export declare function clearBusinessSession(cookies: CookieAdapterLike | undefined): void;
export declare function getBusinessId(cookies: CookieAdapterLike | undefined): string | null;
export { normalizePhone };
//# sourceMappingURL=business-auth.d.ts.map