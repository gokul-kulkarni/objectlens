import { describe, expect, it } from 'vitest';
import { InMemoryNodeSource } from './memory.js';
import { buildGraph } from '../model/graph.js';
import { TEST_SOURCE, int, seq, str } from '../testing/fixtures.js';

const graph = buildGraph(
  seq('$', [int('$[0]', 0), int('$[1]', 1), int('$[2]', 2), int('$[3]', 3)]),
  TEST_SOURCE,
);

const source = () => new InMemoryNodeSource(graph);

describe('InMemoryNodeSource', () => {
  it('declares itself synchronous so views can skip loading states', () => {
    expect(source().isSynchronous).toBe(true);
  });

  it('returns the root', async () => {
    expect((await source().getRoot()).id).toBe('$');
  });

  it('looks up a node by id', async () => {
    expect((await source().getNode('$[2]'))?.id).toBe('$[2]');
  });

  it('returns undefined for an unknown id', async () => {
    expect(await source().getNode('$.nope')).toBeUndefined();
  });

  it('returns all children when no range is given', async () => {
    const window = await source().getChildren('$');

    expect(window.children).toHaveLength(4);
    expect(window.totalCount).toBe(4);
    expect(window.offset).toBe(0);
  });

  it('returns a window and still reports the true total', async () => {
    // Reporting the full total from a partial window is what lets a view page without knowing
    // whether it is talking to memory or a live process.
    const window = await source().getChildren('$', { offset: 1, limit: 2 });

    expect(window.children.map((c) => c.node.id)).toEqual(['$[1]', '$[2]']);
    expect(window.totalCount).toBe(4);
    expect(window.offset).toBe(1);
  });

  it('clamps a negative offset', async () => {
    const window = await source().getChildren('$', { offset: -5, limit: 2 });

    expect(window.offset).toBe(0);
    expect(window.children.map((c) => c.node.id)).toEqual(['$[0]', '$[1]']);
  });

  it('treats a negative limit as empty rather than slicing backwards', async () => {
    expect((await source().getChildren('$', { offset: 0, limit: -1 })).children).toEqual([]);
  });

  it('returns an empty window past the end', async () => {
    const window = await source().getChildren('$', { offset: 99, limit: 10 });

    expect(window.children).toEqual([]);
    expect(window.totalCount).toBe(4);
  });

  it('returns an empty window for an unknown node', async () => {
    const window = await source().getChildren('$.nope');

    expect(window.children).toEqual([]);
    expect(window.totalCount).toBe(0);
  });

  it('returns no children for a leaf', async () => {
    const leaf = buildGraph(str('$', 'x'), TEST_SOURCE);
    expect((await new InMemoryNodeSource(leaf).getChildren('$')).totalCount).toBe(0);
  });
});
