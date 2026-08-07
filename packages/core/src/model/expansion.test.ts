import { describe, expect, it } from 'vitest';
import { buildGraph } from './graph.js';
import { expandAll, initialExpansion, toggle } from './expansion.js';
import { childrenOf } from '../traversal/children.js';
import type { NodeId } from './ids.js';
import { TEST_SOURCE, entry, field, int, map, obj, seq, str } from '../testing/fixtures.js';

const graph = () =>
  buildGraph(
    map('$', [
      entry(
        str('$@key0', 'users'),
        seq(`$['users']`, [
          obj(`$['users'][0]`, 'User', [field('name', str(`$['users'][0].name`, 'ada'))]),
        ]),
      ),
      entry(str('$@key1', 'n'), int(`$['n']`, 2)),
    ]),
    TEST_SOURCE,
  );

/** Nodes a view would draw: the root, plus every child of an expanded node. */
function visibleCount(g: ReturnType<typeof graph>, expanded: ReadonlySet<NodeId>): number {
  let count = 1;
  for (const id of expanded) {
    const node = g.nodesById.get(id);
    if (node !== undefined) count += childrenOf(node).length;
  }
  return count;
}

describe('initialExpansion', () => {
  it('expands enough to show structure on first render', () => {
    const expanded = initialExpansion(graph());

    expect(expanded.has('$')).toBe(true);
    expect(expanded.has(`$['users']`)).toBe(true);
  });

  it('stops at the node budget so a huge graph does not arrive fully expanded', () => {
    const wide = buildGraph(
      seq('$', Array.from({ length: 1_000 }, (_, i) => seq(`$[${i}]`, [int(`$[${i}][0]`, i)]))),
      TEST_SOURCE,
    );

    // Without the budget every one of the 1,000 sequences would be expanded, so a view would be
    // asked to draw ~2,000 nodes before the reader has done anything.
    expect(visibleCount(wide, initialExpansion(wide, 50))).toBeLessThan(1_100);
  });

  it('does not expand leaves', () => {
    expect(initialExpansion(buildGraph(int('$', 1), TEST_SOURCE)).has('$')).toBe(false);
  });
});

describe('toggle', () => {
  it('adds an id that was collapsed and removes one that was expanded', () => {
    const collapsed: ReadonlySet<NodeId> = new Set();

    const expanded = toggle(collapsed, '$');
    expect(expanded.has('$')).toBe(true);

    expect(toggle(expanded, '$').has('$')).toBe(false);
  });

  it('returns a new set rather than mutating the old one', () => {
    const original: ReadonlySet<NodeId> = new Set(['$']);
    const next = toggle(original, '$.a');

    expect(next).not.toBe(original);
    expect(original.has('$.a')).toBe(false);
  });
});

describe('expandAll', () => {
  it('adds every id without dropping existing ones', () => {
    const result = expandAll(new Set(['$']), ['$.a', '$.b']);
    expect([...result].sort()).toEqual(['$', '$.a', '$.b']);
  });

  it('returns a new set', () => {
    const original: ReadonlySet<NodeId> = new Set(['$']);
    expect(expandAll(original, ['$.a'])).not.toBe(original);
  });
});
