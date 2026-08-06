/**
 * Bundled examples.
 *
 * The empty state has to teach the input format, and a paste box with no hint teaches nothing.
 * Each example is real `repr()` / JSON output chosen to show one thing the viewer handles that a
 * plain text dump does not.
 */
export interface Example {
    readonly name: string;
    readonly description: string;
    readonly text: string;
}
export declare const EXAMPLES: readonly Example[];
//# sourceMappingURL=examples.d.ts.map