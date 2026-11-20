export declare function imageLuminanceFromBytes(bytes: Uint8Array): Promise<number | null>;
export declare function imageLuminanceFromUrl(url: string): Promise<number | null>;
export interface HeroWash {
    scrimL: number;
    scrimM: number;
    scrimB: number;
}
export declare const HERO_WASH_DEFAULT: HeroWash;
export declare function washForLuminance(lum: number | null | undefined): HeroWash;
//# sourceMappingURL=image-luminance.d.ts.map