/**
 * Wiring: the one place that knows which adapters and views exist.
 *
 * Everything else talks to the registries, so adding a format or a view means adding a line here
 * and nothing more. This is also exactly what a third-party plugin author does — depend on
 * `@objectlens/core`, implement the interface, register it at bootstrap.
 */

import { SourceAdapterRegistry, ViewRegistry } from '@objectlens/core';
import { jsonAdapter } from '@objectlens/adapter-json';
import { pythonAdapter } from '@objectlens/adapter-python';
import { treeViewPlugin } from '@objectlens/view-tree';
import { graphViewPlugin } from '@objectlens/view-graph';

export const adapters = new SourceAdapterRegistry();
adapters.register(jsonAdapter);
adapters.register(pythonAdapter);

export const views = new ViewRegistry();
views.register(treeViewPlugin);
views.register(graphViewPlugin);
