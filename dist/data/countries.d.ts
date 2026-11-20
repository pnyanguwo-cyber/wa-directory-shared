export interface CountryCode {
    code: string;
    country: string;
    flag: string;
    prefix: string;
    length: number;
}
export declare const countryCodes: CountryCode[];
export declare function validatePhone(countryCode: string, phone: string): string | null;
//# sourceMappingURL=countries.d.ts.map