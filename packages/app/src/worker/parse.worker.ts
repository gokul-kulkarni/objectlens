/**
 * Parsing — and comparing — off the main thread.
 *
 * A 10 MB paste takes long enough to parse that doing it inline freezes the tab — no spinner, no
 * cancel, nothing. The worker keeps the UI responsive and makes the size guard meaningful. A
 * comparison parses two inputs and walks both, so it runs here for the same reason.
 *
 * The `ObjectGraph` crosses the boundary by structured clone, which handles the `Map` indexes
 * natively, so nothing needs a bespoke serialisation format.
 */

import type { Diagnostic, ObjectGraph, RawInput } from '@objectlens/core';
import { SourceAdapterRegistry } from '@objectlens/core';
import { diffGraphs, type DiffOptions, type DiffResult } from '@objectlens/diff';
import { jsonAdapter } from '@objectlens/adapter-json';
import { pythonAdapter } from '@objectlens/adapter-python';
import { snapshotAdapter } from '@objectlens/adapter-snapshot';
import { yamlAdapter } from '@objectlens/adapter-yaml';

export interface SourceInput {
  readonly adapterId: string;
  readonly text: string;
  readonly filename?: string;
}

export interface ParseRequest extends SourceInput {
  readonly type: 'parse';
  readonly id: number;
}

export interface CompareRequest {
  readonly type: 'compare';
  readonly id: number;
  readonly left: SourceInput;
  readonly right: SourceInput;
  readonly options: DiffOptions;
}

export type WorkerRequest = ParseRequest | CompareRequest;

export interface ParseResponse {
  readonly type: 'parse';
  readonly id: number;
  readonly graph: ObjectGraph | null;
  readonly diagnostics: readonly Diagnostic[];
  readonly elapsedMs: number;
}

export interface CompareResponse {
  readonly type: 'compare';
  readonly id: number;
  /** `null` when either side could not be parsed at all. */
  readonly diff: DiffResult | null;
  readonly leftDiagnostics: readonly Diagnostic[];
  readonly rightDiagnostics: readonly Diagnostic[];
  readonly elapsedMs: number;
}

export type WorkerResponse = ParseResponse | CompareResponse;

// The worker registers its own adapters: it cannot share the main thread's registry, and passing
// functions across the boundary is impossible.
const registry = new SourceAdapterRegistry();
registry.register(jsonAdapter);
registry.register(pythonAdapter);
registry.register(snapshotAdapter);
registry.register(yamlAdapter);

function parseSource({ adapterId, text, filename }: SourceInput) {
  const input: RawInput = filename === undefined ? { text } : { text, filename };
  return registry.parseWith(adapterId, input);
}

async function handle(request: WorkerRequest): Promise<WorkerResponse> {
  const started = performance.now();

  if (request.type === 'parse') {
    const result = await parseSource(request);
    return {
      type: 'parse',
      id: request.id,
      graph: result.graph,
      diagnostics: result.diagnostics,
      elapsedMs: performance.now() - started,
    };
  }

  const [left, right] = await Promise.all([parseSource(request.left), parseSource(request.right)]);
  const diff =
    left.graph === null || right.graph === null ? null : diffGraphs(left.graph, right.graph, request.options);

  return {
    type: 'compare',
    id: request.id,
    diff,
    leftDiagnostics: left.diagnostics,
    rightDiagnostics: right.diagnostics,
    elapsedMs: performance.now() - started,
  };
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  void handle(event.data).then((response) => self.postMessage(response));
});
