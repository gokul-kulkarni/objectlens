import { describe, expect, it } from 'vitest';
import { ancestorsOf, buildGraph, pathTo, resolveRef } from './graph.js';
import { parseError } from './diagnostics.js';
import { deepChain, entry, field, int, map, obj, ref, seq, str } from '../testing/fixtures.js';
import { TEST_SOURCE } from '../testing/fixtures.js';

const sample = () =>
  map('$', [
    entry(
      str('$@key0', 'users'),
      seq('$["users"]', [obj('$["users"][0]', 'User', [field('name', str('$["users"][0].name', 'ada'))])]),
    ),
  ]);

describe('buildGraph', () => {
  it('indexes every node by id', () => {
    const graph = buildGraph(sample(), TEST_SOURCE);

    expect([...graph.nodesById.keys()].sort()).toEqual([
      '$',
      '$["users"]',
      '$["users"][0]',
      '$["users"][0].name',
    ]);
  });

  it('records each node’s parent, leaving the root without one', () => {
    const graph = buildGraph(sample(), TEST_SOURCE);

    expect(graph.parentById.get('$["users"][0]')).toBe('$["users"]');
    expect(graph.parentById.has('$')).toBe(false);
  });

  it('records the label the parent gave each node', () => {
    const graph = buildGraph(sample(), TEST_SOURCE);

    expect(graph.labelById.get('$["users"]')).toBe('users');
    expect(graph.labelById.get('$["users"][0]')).toBe('0');
    expect(graph.labelById.get('$["users"][0].name')).toBe('name');
  });

  it('preserves adapter diagnostics', () => {
    const graph = buildGraph(sample(), TEST_SOURCE, {
      diagnostics: [parseError('bad token', { line: 3 })],
    });

    expect(graph.diagnostics).toHaveLength(1);
    expect(graph.diagnostics[0]?.message).toBe('bad token');
  });

  it('warns rather than silently dropping a node when ids collide', () => {
    const duplicated = seq('$', [str('$[0]', 'first'), str('$[0]', 'second')]);
    const graph = buildGraph(duplicated, TEST_SOURCE);

    expect(graph.nodesById.size).toBe(2);
    expect(graph.diagnostics).toHaveLength(1);
    expect(graph.diagnostics[0]?.severity).toBe('warning');
    expect(graph.diagnostics[0]?.message).toContain('$[0]');
  });

  it('defaults truncated to false and carries it through when set', () => {
    expect(buildGraph(sample(), TEST_SOURCE).truncated).toBe(false);
    expect(buildGraph(sample(), TEST_SOURCE, { truncated: true }).truncated).toBe(true);
  });

  it('does not follow refs', () => {
    const cyclic = map('$', [entry(str('$@key0', 'self'), ref('$["self"]', '$', true))]);
    const graph = buildGraph(cyclic, TEST_SOURCE);

    expect(graph.nodesById.size).toBe(2);
  });

  it('handles a chain deep enough to overflow a recursive implementation', () => {
    const graph = buildGraph(deepChain(50_000), TEST_SOURCE);
    expect(graph.nodesById.size).toBe(50_001);
  });
});

describe('pathTo', () => {
  it('returns root-first ids down to the target inclusive', () => {
    const graph = buildGraph(sample(), TEST_SOURCE);

    expect(pathTo(graph, '$["users"][0].name')).toEqual([
      '$',
      '$["users"]',
      '$["users"][0]',
      '$["users"][0].name',
    ]);
  });

  it('is just the root for the root', () => {
    expect(pathTo(buildGraph(sample(), TEST_SOURCE), '$')).toEqual(['$']);
  });

  it('is empty for an unknown id', () => {
    expect(pathTo(buildGraph(sample(), TEST_SOURCE), '$.nope')).toEqual([]);
  });
});

describe('ancestorsOf', () => {
  it('excludes the node itself, giving exactly what must be expanded to reveal it', () => {
    const graph = buildGraph(sample(), TEST_SOURCE);

    expect(ancestorsOf(graph, '$["users"][0].name')).toEqual([
      '$',
      '$["users"]',
      '$["users"][0]',
    ]);
  });

  it('is empty for the root', () => {
    expect(ancestorsOf(buildGraph(sample(), TEST_SOURCE), '$')).toEqual([]);
  });
});

describe('resolveRef', () => {
  it('follows a ref to its target', () => {
    const cyclic = map('$', [entry(str('$@key0', 'self'), ref('$["self"]', '$', true))]);
    const graph = buildGraph(cyclic, TEST_SOURCE);
    const refNode = graph.nodesById.get('$["self"]');

    expect(resolveRef(graph, refNode!)?.id).toBe('$');
  });

  it('returns non-ref nodes unchanged', () => {
    const graph = buildGraph(sample(), TEST_SOURCE);
    const node = graph.nodesById.get('$["users"]')!;

    expect(resolveRef(graph, node)).toBe(node);
  });

  it('returns undefined for a dangling target, which a truncated snapshot can produce', () => {
    const dangling = seq('$', [ref('$[0]', '$.missing')]);
    const graph = buildGraph(dangling, TEST_SOURCE);

    expect(resolveRef(graph, graph.nodesById.get('$[0]')!)).toBeUndefined();
  });
});

describe('graph metadata', () => {
  it('records the source that produced it', () => {
    expect(buildGraph(int('$', 1), 'python-repr').source).toBe('python-repr');
  });
});
