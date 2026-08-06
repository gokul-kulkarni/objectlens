/**
 * Draggable divider between panels.
 *
 * Width is computed from the pointer's absolute position rather than accumulated deltas, so the
 * handle cannot drift away from the cursor over a long drag.
 *
 * Keyboard-operable on purpose: a divider that only responds to a mouse is invisible to anyone
 * navigating by keyboard, and `role="separator"` promises otherwise.
 */
export interface ResizeHandleProps {
    readonly label: string;
    /** Current width of the panel this handle controls. */
    readonly value: number;
    readonly min: number;
    readonly max: number;
    /** Which side the controlled panel is on — decides which way "bigger" is. */
    readonly side: 'left' | 'right';
    /** Absolute width, from dragging. */
    readonly onResize: (width: number) => void;
    /** Relative nudge, from the keyboard — see `adjustPanel` for why these differ. */
    readonly onAdjust: (delta: number) => void;
    readonly onReset: () => void;
}
export declare function ResizeHandle({ label, value, min, max, side, onResize, onAdjust, onReset, }: ResizeHandleProps): import("react").JSX.Element;
//# sourceMappingURL=ResizeHandle.d.ts.map