/**
 * Input: paste, drop a file, or load an example.
 *
 * The format picker shows what auto-detection chose and lets the user override it — detection is
 * a heuristic over ambiguous text, so it has to be correctable rather than authoritative.
 */
import type { Detection } from '@objectlens/core';
export interface InputPanelProps {
    readonly text: string;
    readonly detections: readonly Detection[];
    readonly adapterId: string | null;
    readonly effectiveAdapterId: string | null;
    readonly status: string;
    readonly onChangeText: (text: string, filename?: string) => void;
    readonly onChangeAdapter: (adapterId: string | null) => void;
    readonly onParse: () => void;
}
export declare function InputPanel({ text, detections, adapterId, effectiveAdapterId, status, onChangeText, onChangeAdapter, onParse, }: InputPanelProps): import("react").JSX.Element;
//# sourceMappingURL=InputPanel.d.ts.map