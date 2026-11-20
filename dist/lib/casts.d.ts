export interface CastSpec {
    segment: 'all' | 'owners' | 'buyers';
    filter: string;
    body: string;
    scheduledFor?: string;
}
export declare const MAX_AUDIENCE = 1000;
export declare const SYNC_MAX_SENDS = 400;
export declare const CHUNK_PER_RUN = 100;
export declare function scheduledForIso(when: 'today' | 'tonight' | 'tomorrow', h: number, m: number, ampm?: string): string;
export declare function parseCastSpec(arg: string): {
    spec: CastSpec | null;
    error?: string;
};
export declare function adminNumbers(): Promise<string[]>;
export declare function broadcastAudience(): Promise<string[]>;
export declare function resolveCastAudience(spec: {
    segment: string;
    filter?: string;
}): Promise<string[]>;
export declare function enqueueCast(spec: CastSpec, createdBy: string, scheduledFor: string | null, audience: string[]): Promise<number | null>;
export interface CastChunkResult {
    ok: boolean;
    done: boolean;
    error?: string;
    sent?: number;
    failed?: number;
    castId?: number;
}
export declare function sendCastChunk(castId: number, maxSends?: number): Promise<CastChunkResult>;
export declare function releaseDueCasts(): Promise<number>;
export declare function renderCastsList(): Promise<string>;
export declare function cancelCast(id: number): Promise<boolean>;
//# sourceMappingURL=casts.d.ts.map