export type StatsEventType = 'profile_view' | 'click_whatsapp' | 'click_call' | 'click_website' | 'impression' | 'qr_scan' | 'bot_search' | 'bot_chat_open' | 'share_bot' | 'share_web';
export declare const STAT_EVENT_LABELS: Record<StatsEventType, string>;
export declare const STAT_EVENT_COLORS: Record<string, string>;
export declare function getEventLabel(type: string): string;
export declare function csvEscape(value: string | number): string;
//# sourceMappingURL=stats-format.d.ts.map