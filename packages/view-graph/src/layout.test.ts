import { describe, expect, it } from 'vitest';
import { buildGraph, type NodeId, type ObjectGraph } from '@objectlens/core';
import {
  TEST_SOURCE,
  deepChain,
  entry,
  field,
  int,
  map,
  obj,
  ref,
  seq,
  str,
} from '@objectlens/core/testing';
import { COLUMN_STRIDE, MAX_GRAPH_NODES, NODE_HEIGHT, NODE_WIDTH, ROW_STRIDE, layout } from './layout.js';

const graph = (): ObjectGraph =>
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

const byId = (result: ReturnType<typeof layout>, id: NodeId) =>
  result.nodes.find((node) => node.id === id);

const ids = (result: ReturnType<typeof layout>) => result.nodes.map((node) => node.id);

describe('which nodes are drawn', () => {
  it('draws only the root when nothing is expanded', () => {
    expect(ids(layout(graph(), { expanded: new Set() }))).toEqual(['$']);
  });

  it('draws the children of expanded nodes, in order', () => {
    const result = layout(graph(), { expanded: new Set(['$']) });
    expect(ids(result)).toEqual(['$', `$['users']`, `$['n']`]);
  });

  it('descends only through expanded ancestors', () => {
    const result = layout(graph(), { expanded: new Set(['$', `$['users']`]) });
    expect(ids(result)).toEqual(['$', `$['users']`, `$['n']`, `$['users'][0]`]);
  });

  it('reports how many children a collapsed node is hiding', () => {
    const result = layout(graph(), { expanded: new Set(['$']) });

    // The badge on a collapsed card is the only hint that a branch exists at all, so the count
    // has to come from the node rather than from what happens to be drawn.
    expect(byId(result, `$['users']`)?.hiddenChildCount).toBe(1);
    expect(byId(result, `$['n']`)?.hiddenChildCount).toBe(0);
  });

  it('marks a collapsed container as having children so it still gets a disclosure control', () => {
    const result = layout(graph(), { expanded: new Set(['$']) });

    expect(byId(result, `$['users']`)?.hasChildren).toBe(true);
    expect(byId(result, `$['users']`)?.isExpanded).toBe(false);
    expect(byId(result, `$['n']`)?.hasChildren).toBe(false);
  });

  it('marks search matches so the canvas can highlight the same nodes the tree does', () => {
    const result = layout(graph(), {
      expanded: new Set(['$']),
      matches: new Set([`$['n']`]),
    });

    expect(byId(result, `$['n']`)?.isMatch).toBe(true);
    expect(byId(result, `$['users']`)?.isMatch).toBe(false);
  });

  it('carries the label and relation the parent gave each node', () => {
    const result = layout(graph(), { expanded: new Set(['$', `$['users']`]) });

    expect(byId(result, `$['users']`)?.label).toBe('users');
    expect(byId(result, `$['users']`)?.relation).toBe('value');
    expect(byId(result, '$')?.relation).toBe('root');
    expect(byId(result, `$['users'][0].name`)).toBeUndefined();
  });
});

describe('positions', () => {
  it('puts each depth in its own column', () => {
    const result = layout(graph(), { expanded: new Set(['$', `$['users']`]) });

    expect(byId(result, '$')?.x).toBe(0);
    expect(byId(result, `$['users']`)?.x).toBe(COLUMN_STRIDE);
    expect(byId(result, `$['users'][0]`)?.x).toBe(COLUMN_STRIDE * 2);
  });

  it('gives every leaf its own row', () => {
    const result = layout(graph(), { expanded: new Set(['$']) });

    expect(byId(result, `$['users']`)?.y).toBe(0);
    expect(byId(result, `$['n']`)?.y).toBe(ROW_STRIDE);
  });

  it('centres a parent on the span of its children', () => {
    const result = layout(graph(), { expanded: new Set(['$']) });

    // Two children at 0 and ROW_STRIDE, so the parent sits halfway between them. This is the one
    // thing that makes a wide branch readable rather than a staircase.
    expect(byId(result, '$')?.y).toBe(ROW_STRIDE / 2);
  });

  it('never overlaps two leaves', () => {
    const wide = buildGraph(
      seq('$', Array.from({ length: 40 }, (_, i) => int(`$[${i}]`, i))),
      TEST_SOURCE,
    );

    const result = layout(wide, { expanded: new Set(['$']) });
    const rows = result.nodes.filter((node) => node.depth === 1).map((node) => node.y);

    expect(new Set(rows).size).toBe(rows.length);
    expect(Math.min(...rows.map((y, i) => (i === 0 ? Infinity : y - (rows[i - 1] ?? 0))))).toBe(
      ROW_STRIDE,
    );
  });

  it('reports a bounding box that contains every card', () => {
    const result = layout(graph(), { expanded: new Set(['$']) });

    expect(result.width).toBe(COLUMN_STRIDE + NODE_WIDTH);
    expect(result.height).toBe(ROW_STRIDE + NODE_HEIGHT);
  });
});

describe('edges', () => {
  it('draws one containment edge per parent-child pair, labelled by the relation', () => {
    const result = layout(graph(), { expanded: new Set(['$']) });
    const child = result.edges.filter((edge) => edge.kind === 'child');

    expect(child.map((edge) => [edge.source, edge.target, edge.label])).toEqual([
      ['$', `$['users']`, 'users'],
      ['$', `$['n']`, 'n'],
    ]);
  });

  it('draws a back-edge for a cycle, kept distinct from an ordinary share', () => {
    // A cycle is usually the reason someone opened the graph view at all. Collapsing it into the
    // same styling as a DAG join would hide exactly the fact worth seeing.
    const cyclic = buildGraph(seq('$', [ref('$[0]', '$', true)]), TEST_SOURCE);
    const result = layout(cyclic, { expanded: new Set(['$']) });

    const back = result.edges.find((edge) => edge.kind === 'cycle');
    expect(back?.source).toBe('$[0]');
    expect(back?.target).toBe('$');
  });

  it('draws a shared reference as a distinct kind from a cycle', () => {
    const shared = buildGraph(
      seq('$', [int('$[0]', 1), ref('$[1]', '$[0]', false)]),
      TEST_SOURCE,
    );

    const result = layout(shared, { expanded: new Set(['$']) });
    expect(result.edges.find((edge) => edge.source === '$[1]')?.kind).toBe('shared');
  });

  it('omits a reference whose target is not on the canvas', () => {
    // Pointing at nothing is worse than saying nothing: the card still reads "shared", so the
    // fact survives even when the line cannot be drawn.
    const shared = buildGraph(
      seq('$', [seq('$[0]', [int('$[0][0]', 1)]), ref('$[1]', '$[0][0]', false)]),
      TEST_SOURCE,
    );

    const result = layout(shared, { expanded: new Set(['$']) });

    expect(result.edges.some((edge) => edge.kind === 'shared')).toBe(false);
    expect(result.edges.every((edge) => edge.kind === 'child')).toBe(true);
  });

  it('gives every edge a unique id', () => {
    const result = layout(graph(), { expanded: new Set(['$', `$['users']`]) });
    expect(new Set(result.edges.map((edge) => edge.id)).size).toBe(result.edges.length);
  });
});

describe('limits', () => {
  it('stops at the node cap and says so', () => {
    const big = buildGraph(
      seq('$', Array.from({ length: 5_000 }, (_, i) => int(`$[${i}]`, i))),
      TEST_SOURCE,
    );

    const result = layout(big, { expanded: new Set(['$']), maxNodes: 100 });

    expect(result.nodes).toHaveLength(100);
    expect(result.truncated).toBe(true);
  });

  it('does not claim truncation merely because a node is collapsed', () => {
    const result = layout(graph(), { expanded: new Set(['$']) });
    expect(result.truncated).toBe(false);
  });

  it('returns an empty layout rather than throwing when the cap is zero', () => {
    const result = layout(graph(), { expanded: new Set(['$']), maxNodes: 0 });

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.width).toBe(0);
  });

  it('defaults to a cap low enough that the picture stays legible', () => {
    expect(MAX_GRAPH_NODES).toBeLessThan(5_000);
  });

  it('handles a chain deep enough to overflow a recursive layout', () => {
    // The row assignment is a post-order walk; written recursively this is where it would die.
    const chain = buildGraph(deepChain(20_000), TEST_SOURCE);
    const expanded = new Set([...chain.nodesById.keys()]);

    const result = layout(chain, { expanded, maxNodes: 20_001 });

    expect(() => result).not.toThrow();
    expect(result.nodes.length).toBe(20_001);
  });
});
