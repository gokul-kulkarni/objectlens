/**
 * Side panel widths.
 *
 * Persisted, because a layout you have to re-drag on every reload is more annoying than a fixed
 * one. `localStorage` is an untrusted boundary — the value can be stale from an older build, or
 * hand-edited — so what comes back is validated and clamped rather than believed.
 */
export interface PanelSizes {
    readonly left: number;
    readonly right: number;
}
export type PanelSide = keyof PanelSizes;
export declare const PANEL_DEFAULTS: PanelSizes;
export declare const PANEL_LIMITS: Readonly<Record<PanelSide, {
    min: number;
    max: number;
}>>;
export declare function clampPanel(side: PanelSide, value: number): number;
/**
 * Shrinks the panels when the window cannot fit them plus a usable centre.
 *
 * Without this, narrowing the window leaves the centre view at zero width with no way to recover
 * except dragging a handle that is now off-screen.
 */
export declare function fitToWidth(sizes: PanelSizes, available: number): PanelSizes;
export declare function usePanelSizes(): {
    sizes: PanelSizes;
    setPanel: (side: PanelSide, value: number) => void;
    adjustPanel: (side: PanelSide, delta: number) => void;
    resetPanel: (side: PanelSide) => void;
};
//# sourceMappingURL=usePanelSizes.d.ts.map