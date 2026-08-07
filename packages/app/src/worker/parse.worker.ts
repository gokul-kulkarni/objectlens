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
import { SourceAdapterRegistry } from '@objectlens/core';
import { jsonAdapter } from '@objectlens/adapter-json';
import { pythonAdapter } from '@objectlens/adapter-python';
import { snapshotAdapter } from '@objectlens/adapter-snapshot';
import { yamlAdapter } from '@objectlens/adapter-yaml';

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

// The worker registers its own adapters: it cannot share the main thread's registry, and passing
// functions across the boundary is impossible.
const registry = new SourceAdapterRegistry();
registry.register(jsonAdapter);
registry.register(pythonAdapter);
registry.register(snapshotAdapter);
registry.register(yamlAdapter);

self.addEventListener('message', (event: MessageEvent<ParseRequest>) => {
  const { id, adapterId, text, filename } = event.data;
  const started = performance.now();

  void registry
    .parseWith(adapterId, filename === undefined ? { text } : { text, filename })
    .then((result) => {
      const response: ParseResponse = {
        id,
        graph: result.graph,
        diagnostics: result.diagnostics,
        elapsedMs: performance.now() - started,
      };
      self.postMessage(response);
    });
});
