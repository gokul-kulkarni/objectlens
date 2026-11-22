/**
 * Wiring: the one place that knows which adapters and views exist.
 *
 * Everything else talks to the registries, so adding a format or a view means adding a line here
 * (or in `adapters.ts`) and nothing more. This is also exactly what a third-party plugin author
 * does — depend on `@objectlens/core`, implement the interface, register it at bootstrap.
 */

import { ViewRegistry } from '@objectlens/core';
import { treeViewPlugin } from '@objectlens/view-tree';
import { graphViewPlugin } from '@objectlens/view-graph';
import { createAdapterRegistry } from './adapters.js';

export const adapters = createAdapterRegistry();

export const views = new ViewRegistry();
views.register(treeViewPlugin);
views.register(graphViewPlugin);
