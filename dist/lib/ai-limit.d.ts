export interface AiLimitStatus {
    limited: boolean;
    resetAt: Date | null;
    reason: 'budget' | 'quota' | null;
}
/** Harare (UTC+2, no DST) and Pacific (UTC-8, no DST in winter) midnights. */
export declare const nextHarareMidnight: () => Date;
export declare const nextPacificMidnight: () => Date;
/** "3h 12m", "45m" or "under a minute" — what the user needs, not milliseconds. */
export declare function formatTimeLeft(resetAt: Date, now?: number): string;
/** Clock time in Harare, e.g. "00:00". */
export declare function harareClock(date: Date): string;
/** Records that Google refused every model with 429 today. Best effort. */
export declare function markAiQuotaExhausted(): Promise<void>;
export declare function getAiLimitStatus(): Promise<AiLimitStatus>;
/** The line a customer sees when AI work is paused but the directory still works. */
export declare function renderAiLimitNotice(resetAt: Date): string;
//# sourceMappingURL=ai-limit.d.ts.map