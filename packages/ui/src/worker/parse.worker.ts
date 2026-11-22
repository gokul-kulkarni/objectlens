/**
 * The parse worker: the engine behind a `postMessage` boundary.
 *
 * The `ObjectGraph` crosses the boundary by structured clone, which handles the `Map` indexes
 * natively, so nothing needs a bespoke serialisation format.
 */

import { createAdapterRegistry } from '../adapters.js';
import { handleRequest } from '../parse/engine.js';
import type { ParseEngineRequest } from '../parse/protocol.js';

const registry = createAdapterRegistry();

self.addEventListener('message', (event: MessageEvent<ParseEngineRequest>) => {
  void handleRequest(registry, event.data).then((response) => self.postMessage(response));
});
