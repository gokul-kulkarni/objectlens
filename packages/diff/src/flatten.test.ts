import { describe, expect, it } from 'vitest';
import type { ObjectGraph, ParseResult } from '@objectlens/core';
import { jsonAdapter } from '@objectlens/adapter-json';
import { diffGraphs } from './diff.js';
import { diffAncestors, flattenDiff, indexDiff, initialDiffExpansion, isChange } from './flatten.js';

const json = (text: string): ObjectGraph => {
  const graph = (jsonAdapter.parse({ text }, {}) as ParseResult).graph;
  if (graph === null) throw new Error('fixture failed to parse');
  return graph;
};

const result = () =>
  diffGraphs(
    json('{"keep": 1, "user": {"name": "ada", "age": 3}, "gone": true}'),
    json('{"keep": 1, "user": {"name": "ada", "age": 4}, "new": [1]}'),
  );

const labels = (rows: readonly { node: { label: string } }[]) => rows.map((row) => row.node.label);

describe('flattenDiff', () => {
  it('shows only the root when nothing is expanded', () => {
    const rows = flattenDiff(result(), { expanded: new Set() });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ depth: 0, hasChildren: true, isExpanded: false });
  });

  it('includes expanded children in document order with depth', () => {
    const rows = flattenDiff(result(), { expanded: new Set(['$', '$["user"]']) });
    expect(labels(rows)).toEqual(['', 'keep', 'user', 'name', 'age', 'new', 'gone']);
    expect(rows.find((row) => row.node.label === 'age')?.depth).toBe(2);
  });

  it('hides unchanged positions when filtering to changes', () => {
    const rows = flattenDiff(result(), { expanded: new Set(['$', '$["user"]']), onlyChanges: true });
    expect(labels(rows)).toEqual(['', 'user', 'age', 'new', 'gone']);
  });

  it('reports no children for a container whose children are all filtered out', () => {
    const same = diffGraphs(json('{"a": {"b": 1}}'), json('{"a": {"b": 1}}'));
    const rows = flattenDiff(same, { expanded: new Set(['$']), onlyChanges: true });
    expect(rows[0]?.hasChildren).toBe(false);
  });

  it('stops at maxRows', () => {
    expect(flattenDiff(result(), { expanded: new Set(['$']), maxRows: 2 })).toHaveLength(2);
  });
});

describe('indexDiff', () => {
  it('lists the changes themselves in document order, not their containers', () => {
    expect(indexDiff(result()).changes).toEqual(['$["user"]["age"]', '$["new"]', '$["gone"]']);
  });

  it('indexes every node and its parent', () => {
    const index = indexDiff(result());
    expect(index.byId.get('$["user"]["age"]')?.status).toBe('changed');
    expect(index.parentById.get('$["user"]["age"]')).toBe('$["user"]');
    expect(diffAncestors(index, '$["user"]["age"]')).toEqual(['$', '$["user"]']);
    expect(diffAncestors(index, '$')).toEqual([]);
  });
});

describe('initialDiffExpansion', () => {
  it('opens the path down to every change and nothing else', () => {
    expect([...initialDiffExpansion(result())].sort()).toEqual(['$', '$["user"]']);
  });

  it('respects its cap', () => {
    expect(initialDiffExpansion(result(), 1).size).toBe(1);
  });

  it('opens a changed container that has changes inside it', () => {
    const diff = diffGraphs(json('{"a": {"b": 1}}'), json('{"a": {"b": 2}}'));
    expect(initialDiffExpansion(diff).has('$["a"]')).toBe(true);
  });
});

describe('isChange', () => {
  it('is true for a position that itself changed, false for a container of changes', () => {
    const diff = result();
    expect(isChange(diff.root)).toBe(false);
    expect(isChange(diff.root.children[0] ?? diff.root)).toBe(false);
  });
});
