export declare function logBotMessage(phone: string, dir: 'in' | 'out', kind: string, body: string): Promise<void>;
export declare function logBotSearch(phone: string, term: string, city: string | null): Promise<void>;
export declare function pruneBotMessages(): Promise<void>;
/** List of callers with transcript activity in the last N days (default 14). */
export declare function transcriptCallers(days?: number): Promise<{
    phone: string;
    last_at: string;
    messages: number;
}[]>;
/** Word-for-word conversation for one caller, oldest first. */
export declare function transcriptFor(phone: string, limit?: number): Promise<{
    dir: any;
    kind: any;
    body: any;
    created_at: any;
}[]>;
//# sourceMappingURL=bot-log.d.ts.map