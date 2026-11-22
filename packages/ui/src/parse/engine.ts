/**
 * Parsing and comparing, as a pure function of a request.
 *
 * Runs inside the parse worker normally, and on the main thread when the host refuses workers
 * (a sandboxed editor frame, for one). Keeping it free of `self` and `postMessage` is what lets
 * the same code serve both.
 */

import type { RawInput, SourceAdapterRegistry } from '@objectlens/core';
import { diffGraphs } from '@objectlens/diff';
import type { ParseEngineRequest, ParseEngineResponse, SourceInput } from './protocol.js';

function parseSource(registry: SourceAdapterRegistry, { adapterId, text, filename }: SourceInput) {
  const input: RawInput = filename === undefined ? { text } : { text, filename };
  return registry.parseWith(adapterId, input);
}

export async function handleRequest(
  registry: SourceAdapterRegistry,
  request: ParseEngineRequest,
): Promise<ParseEngineResponse> {
  const started = performance.now();

  if (request.type === 'parse') {
    const result = await parseSource(registry, request);
    return {
      type: 'parse',
      id: request.id,
      graph: result.graph,
      diagnostics: result.diagnostics,
      elapsedMs: performance.now() - started,
    };
  }

  const [left, right] = await Promise.all([
    parseSource(registry, request.left),
    parseSource(registry, request.right),
  ]);
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
