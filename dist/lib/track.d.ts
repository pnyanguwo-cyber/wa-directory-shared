import type { StatsEventType } from '../types/index.js';
export type { StatsEventType };
export declare function trackEvent(businessId: string, type: StatsEventType, extra?: {
    category?: string;
    city?: string;
}): void;
//# sourceMappingURL=track.d.ts.map