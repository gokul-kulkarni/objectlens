import { describe, expect, it } from 'vitest';
import { buildGraph, type NodeId } from '@objectlens/core';
import {
  TEST_SOURCE,
  deepChain,
  entry,
  field,
  int,
  map,
  obj,
  seq,
  str,
} from '@objectlens/core/testing';
import { expandAll, flatten, initialExpansion, toggle } from './rows.js';

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

const ids = (rows: readonly { node: { id: NodeId } }[]) => rows.map((r) => r.node.id);

describe('flatten', () => {
  it('shows only the root when nothing is expanded', () => {
    expect(ids(flatten(graph(), { expanded: new Set() }))).toEqual(['$']);
  });

  it('shows children of expanded nodes, in order', () => {
    const rows = flatten(graph(), { expanded: new Set(['$']) });
    expect(ids(rows)).toEqual(['$', `$['users']`, `$['n']`]);
  });

  it('descends only through expanded ancestors', () => {
    const rows = flatten(graph(), { expanded: new Set(['$', `$['users']`]) });

    expect(ids(rows)).toEqual(['$', `$['users']`, `$['users'][0]`, `$['n']`]);
  });

  it('reports depth for indentation', () => {
    const rows = flatten(graph(), { expanded: new Set(['$', `$['users']`]) });
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 1]);
  });

  it('carries the label the parent gave each node', () => {
    const rows = flatten(graph(), { expanded: new Set(['$']) });
    expect(rows.map((r) => r.label)).toEqual(['', 'users', 'n']);
  });

  it('marks rows that have children, so leaves get no disclosure arrow', () => {
    const rows = flatten(graph(), { expanded: new Set(['$']) });
    expect(rows.map((r) => r.hasChildren)).toEqual([true, true, false]);
  });

  it('marks search matches for highlighting', () => {
    const rows = flatten(graph(), {
      expanded: new Set(['$']),
      matches: new Set([`$['n']`]),
    });

    expect(rows.find((r) => r.node.id === `$['n']`)?.isMatch).toBe(true);
    expect(rows.find((r) => r.node.id === `$['users']`)?.isMatch).toBe(false);
  });

  it('hides non-visible nodes in filter-to-matches mode', () => {
    // `visible` narrows the tree; `matches` only highlights. Conflating them would make
    // highlighting destroy context.
    const rows = flatten(graph(), {
      expanded: new Set(['$', `$['users']`]),
      visible: new Set(['$', `$['n']`]),
    });

    expect(ids(rows)).toEqual(['$', `$['n']`]);
  });

  it('stops at maxRows so a runaway graph cannot lock the UI', () => {
    const big = buildGraph(
      seq('$', Array.from({ length: 5_000 }, (_, i) => int(`$[${i}]`, i))),
      TEST_SOURCE,
    );

    expect(flatten(big, { expanded: new Set(['$']), maxRows: 100 })).toHaveLength(100);
  });

  it('handles a chain deep enough to overflow a recursive implementation', () => {
    const chain = buildGraph(deepChain(20_000), TEST_SOURCE);
    const expanded = new Set([...chain.nodesById.keys()]);

    expect(() => flatten(chain, { expanded })).not.toThrow();
  });
});

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

    const rows = flatten(wide, { expanded: initialExpansion(wide, 50) });
    expect(rows.length).toBeLessThan(1_100);
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
