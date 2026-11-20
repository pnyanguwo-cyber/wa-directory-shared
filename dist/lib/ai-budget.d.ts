export declare const AI_DAILY_BUDGET_USD: number;
export declare function checkAiBudget(): Promise<{
    allowed: boolean;
    spent: number;
    limit: number;
}>;
/** True at most once every ten minutes, so a blocked cap logs one row, not one per message. */
export declare function shouldLogBudgetBlock(): boolean;
//# sourceMappingURL=ai-budget.d.ts.map