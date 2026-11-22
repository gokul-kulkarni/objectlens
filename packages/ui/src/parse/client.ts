/**
 * Runs parse requests in a Web Worker, or on the main thread when a worker is not available.
 *
 * A 10 MB paste takes long enough to parse that doing it inline freezes the tab, so the worker is
 * the normal path. Some hosts refuse workers outright — a sandboxed editor frame with no
 * `worker-src`, a blob-less CSP — and there an inline parse that briefly blocks beats a viewer
 * that never shows anything. The fallback also replays whatever request was in flight when the
 * worker failed, so the caller never waits on an answer that will not come.
 */

import { createAdapterRegistry } from '../adapters.js';
import { handleRequest } from './engine.js';
import type { ParseEngineRequest, ParseEngineResponse } from './protocol.js';

export interface ParseClient {
  post(request: ParseEngineRequest): void;
  dispose(): void;
}

export type WorkerFactory = () => Worker;

const defaultWorkerFactory: WorkerFactory = () =>
  new Worker(new URL('../worker/parse.worker.ts', import.meta.url), { type: 'module' });

export function createParseClient(
  onResponse: (response: ParseEngineResponse) => void,
  createWorker: WorkerFactory = defaultWorkerFactory,
): ParseClient {
  let disposed = false;
  let worker: Worker | null = null;
  let pending: ParseEngineRequest | null = null;
  let inlineRegistry: ReturnType<typeof createAdapterRegistry> | null = null;

  const runInline = (request: ParseEngineRequest) => {
    inlineRegistry ??= createAdapterRegistry();
    void handleRequest(inlineRegistry, request).then((response) => {
      if (!disposed) onResponse(response);
    });
  };

  const fallBack = () => {
    worker?.terminate();
    worker = null;
    const replay = pending;
    pending = null;
    if (replay !== null) runInline(replay);
  };

  try {
    worker = createWorker();
    worker.addEventListener('message', (event: MessageEvent<ParseEngineResponse>) => {
      if (pending?.id === event.data.id && pending.type === event.data.type) pending = null;
      onResponse(event.data);
    });
    worker.addEventListener('error', fallBack);
  } catch {
    worker = null;
  }

  return {
    post(request) {
      if (disposed) return;
      if (worker === null) {
        runInline(request);
        return;
      }
      pending = request;
      worker.postMessage(request);
    },
    dispose() {
      disposed = true;
      worker?.terminate();
      worker = null;
    },
  };
}
