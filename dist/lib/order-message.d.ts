export interface OrderLine {
    name: string;
    qty: number;
    price: number | null;
}
export interface CompiledOrder {
    text: string;
    lines: string[];
    total: number | null;
}
export declare function compileOrderText(input: {
    businessName: string;
    city?: string | null;
    lines: OrderLine[];
    note?: string | null;
}): CompiledOrder;
export declare function orderWaHref(digits: string, order: string): string;
//# sourceMappingURL=order-message.d.ts.map