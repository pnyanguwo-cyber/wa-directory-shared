interface ImageSignature {
    ext: string;
    type: string;
    test: (b: Uint8Array) => boolean;
}
export declare const MAX_LOGO_BYTES: number;
export declare function sniffImage(bytes: Uint8Array): ImageSignature | null;
export declare function uploadLogoImage(bytes: Uint8Array): Promise<string | null>;
export {};
//# sourceMappingURL=image-storage.d.ts.map