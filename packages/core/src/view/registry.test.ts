import { describe, expect, it } from 'vitest';
import { ViewRegistry } from './registry.js';
import type { ViewPlugin } from './types.js';
import { buildGraph } from '../model/graph.js';
import { TEST_SOURCE, seq, str } from '../testing/fixtures.js';

const NOOP_COMPONENT = (() => null) as unknown as ViewPlugin['Component'];

function view(id: string, overrides: Partial<ViewPlugin> = {}): ViewPlugin {
  return {
    id,
    label: id,
    canRender: () => true,
    Component: NOOP_COMPONENT,
    ...overrides,
  };
}

const graph = buildGraph(seq('$', [str('$[0]', 'x')]), TEST_SOURCE);

describe('registration', () => {
  it('registers and retrieves a view', () => {
    const registry = new ViewRegistry();
    const tree = view('tree');

    expect(registry.register(tree)).toBeUndefined();
    expect(registry.get('tree')).toBe(tree);
  });

  it('lists views in registration order, which is the order the switcher shows', () => {
    const registry = new ViewRegistry();
    registry.register(view('tree'));
    registry.register(view('graph'));
    registry.register(view('table'));

    expect(registry.list().map((v) => v.id)).toEqual(['tree', 'graph', 'table']);
  });

  it('preserves position when replacing an existing view', () => {
    // Hot reload re-registers; the switcher must not reshuffle under the user.
    const registry = new ViewRegistry();
    registry.register(view('tree'));
    registry.register(view('graph'));

    const replacement = view('tree', { label: 'Tree v2' });
    expect(registry.register(replacement)).toBeDefined();

    expect(registry.list().map((v) => v.id)).toEqual(['tree', 'graph']);
    expect(registry.get('tree')?.label).toBe('Tree v2');
  });

  it('unregisters and drops the view from ordering', () => {
    const registry = new ViewRegistry();
    registry.register(view('tree'));
    registry.register(view('graph'));

    expect(registry.unregister('tree')).toBe(true);
    expect(registry.list().map((v) => v.id)).toEqual(['graph']);
    expect(registry.unregister('tree')).toBe(false);
  });
});

describe('available', () => {
  it('offers only views that can render the graph', () => {
    const registry = new ViewRegistry();
    registry.register(view('tree'));
    registry.register(view('table', { canRender: () => false }));

    expect(registry.available(graph).map((v) => v.id)).toEqual(['tree']);
  });

  it('excludes a view whose canRender throws instead of breaking the page', () => {
    const registry = new ViewRegistry();
    registry.register(
      view('hostile', {
        canRender: () => {
          throw new Error('boom');
        },
      }),
    );
    registry.register(view('tree'));

    expect(registry.available(graph).map((v) => v.id)).toEqual(['tree']);
  });

  it('can be empty when nothing can render', () => {
    const registry = new ViewRegistry();
    registry.register(view('table', { canRender: () => false }));

    expect(registry.available(graph)).toEqual([]);
  });
});
