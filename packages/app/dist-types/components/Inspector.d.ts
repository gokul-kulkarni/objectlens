/**
 * Detail panel for the selected node: its access path, type, and full value.
 *
 * The path is the payload here — "which expression gets me this value" is the question a debugging
 * session actually needs answered, and the tree row can only show a truncated preview.
 */
import { type NodeId, type ObjectGraph } from '@objectlens/core';
export interface InspectorProps {
    readonly graph: ObjectGraph;
    readonly selection: NodeId | null;
    readonly onSelect: (id: NodeId) => void;
}
export declare function Inspector({ graph, selection, onSelect }: InspectorProps): import("react").JSX.Element;
//# sourceMappingURL=Inspector.d.ts.map