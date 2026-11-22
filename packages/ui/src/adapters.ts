/**
 * The source formats ObjectLens understands, in one place.
 *
 * Shared by the main thread (detection, the format picker, Prettify) and the parse worker, which
 * cannot share the main thread's registry because functions do not cross `postMessage`. Building
 * both from this one function means a new format is registered once, not twice.
 *
 * Deliberately free of views and React, so the worker bundle stays small.
 */

import { SourceAdapterRegistry } from '@objectlens/core';
import { jsonAdapter } from '@objectlens/adapter-json';
import { pythonAdapter } from '@objectlens/adapter-python';
import { snapshotAdapter } from '@objectlens/adapter-snapshot';
import { yamlAdapter } from '@objectlens/adapter-yaml';

export function createAdapterRegistry(): SourceAdapterRegistry {
  const registry = new SourceAdapterRegistry();
  registry.register(jsonAdapter);
  registry.register(pythonAdapter);
  registry.register(snapshotAdapter);
  registry.register(yamlAdapter);
  return registry;
}
