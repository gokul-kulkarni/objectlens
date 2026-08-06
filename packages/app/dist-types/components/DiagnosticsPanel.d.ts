/**
 * Parse diagnostics.
 *
 * Shown as a collapsed strip rather than a blocking error: partial input still produced a usable
 * graph, so the reader gets the graph *and* an honest account of what could not be read.
 */
import type { Diagnostic, NodeId } from '@objectlens/core';
export interface DiagnosticsPanelProps {
    readonly diagnostics: readonly Diagnostic[];
    readonly onSelect: (id: NodeId) => void;
}
export declare function DiagnosticsPanel({ diagnostics, onSelect }: DiagnosticsPanelProps): import("react").JSX.Element | null;
//# sourceMappingURL=DiagnosticsPanel.d.ts.map