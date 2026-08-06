/**
 * Parsing off the main thread.
 *
 * A 10 MB paste takes long enough to parse that doing it inline freezes the tab — no spinner, no
 * cancel, nothing. The worker keeps the UI responsive and makes the size guard meaningful.
 *
 * The `ObjectGraph` crosses the boundary by structured clone, which handles the `Map` indexes
 * natively, so nothing needs a bespoke serialisation format.
 */
import type { Diagnostic, ObjectGraph } from '@objectlens/core';
export interface ParseRequest {
    readonly id: number;
    readonly adapterId: string;
    readonly text: string;
    readonly filename?: string;
}
export interface ParseResponse {
    readonly id: number;
    readonly graph: ObjectGraph | null;
    readonly diagnostics: readonly Diagnostic[];
    readonly elapsedMs: number;
}
//# sourceMappingURL=parse.worker.d.ts.map