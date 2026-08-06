/**
 * Viewer state.
 *
 * Selection, expansion and search live here rather than inside any view — that is what keeps the
 * tree and the graph in sync, and what lets a third-party view inherit that sync for free.
 *
 * Every transition returns new state; nothing is mutated in place.
 */
import { type Diagnostic, type NodeId, type ObjectGraph } from '@objectlens/core';
export interface ViewerState {
    readonly text: string;
    readonly filename?: string;
    /** `null` means "auto-detect"; a string pins the user's explicit choice. */
    readonly adapterId: string | null;
    readonly graph: ObjectGraph | null;
    readonly diagnostics: readonly Diagnostic[];
    readonly status: 'empty' | 'parsing' | 'ready' | 'failed';
    readonly elapsedMs: number;
    readonly selection: NodeId | null;
    readonly expanded: ReadonlySet<NodeId>;
    readonly query: string;
    readonly filterToMatches: boolean;
    readonly viewId: string;
}
export declare function useViewer(): {
    state: ViewerState;
    detections: readonly import("@objectlens/core").Detection[];
    effectiveAdapterId: string | null;
    searchResult: import("@objectlens/core").SearchResult | null;
    parse: () => void;
    setInput: (text: string, filename?: string) => void;
    setAdapter: (adapterId: string | null) => void;
    select: (id: NodeId | null) => void;
    toggleExpand: (id: NodeId) => void;
    setQuery: (query: string) => void;
    setFilterToMatches: (enabled: boolean) => void;
    setView: (viewId: string) => void;
};
//# sourceMappingURL=useViewer.d.ts.map