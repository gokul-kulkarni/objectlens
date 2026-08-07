import { describe, expect, it } from 'vitest';
import type { NodeKind } from '@objectlens/core';
import { int, map, obj, opaque, ref, seq, set, str } from '@objectlens/core/testing';
import { edgeStyle, kindColor, nodeColor, relationColor } from './style.js';
import type { GraphEdgeKind, NodeRelation } from './layout.js';

const KINDS: readonly NodeKind[] = ['map', 'sequence', 'set', 'object', 'scalar', 'opaque', 'ref'];
const RELATIONS: readonly NodeRelation[] = ['root', 'value', 'key', 'item', 'field', 'arg'];
const EDGE_KINDS: readonly GraphEdgeKind[] = ['child', 'shared', 'cycle'];

describe('colour comes from tokens, never literals', () => {
  // The tree view resolves the same custom properties. A literal here is how the two views end up
  // painting a scalar two different greens.
  it.each(KINDS)('%s resolves to a custom property', (kind) => {
    expect(kindColor(kind)).toMatch(/^var\(--color-[a-z-]+\)$/);
  });

  it.each(RELATIONS)('the %s relation resolves to a custom property', (relation) => {
    expect(relationColor(relation)).toMatch(/^var\(--color-label-[a-z]+\)$/);
  });

  it.each(EDGE_KINDS)('a %s edge strokes with a custom property', (kind) => {
    expect(edgeStyle(kind).stroke).toMatch(/^var\(--color-[a-z-]+\)$/);
  });
});

describe('nodeColor', () => {
  it('matches the node-kind token the tree uses for the same node', () => {
    expect(nodeColor(str('$', 'x'))).toBe('var(--color-node-scalar)');
    expect(nodeColor(int('$', 1))).toBe('var(--color-node-scalar)');
    expect(nodeColor(opaque('$', '<Foo object>'))).toBe('var(--color-node-opaque)');
    expect(nodeColor(ref('$', '$.a'))).toBe('var(--color-node-ref)');
  });

  it('paints every container the same, because their shape already tells them apart', () => {
    const container = 'var(--color-node-container)';

    expect(nodeColor(map('$', []))).toBe(container);
    expect(nodeColor(seq('$', []))).toBe(container);
    expect(nodeColor(set('$', []))).toBe(container);
    expect(nodeColor(obj('$', 'User'))).toBe(container);
  });
});

describe('edgeStyle', () => {
  it('draws containment solid and references dashed', () => {
    expect(edgeStyle('child').strokeDasharray).toBeUndefined();
    expect(edgeStyle('shared').strokeDasharray).toBeDefined();
    expect(edgeStyle('cycle').strokeDasharray).toBeDefined();
  });

  it('makes a cycle visually distinct from an ordinary share', () => {
    const cycle = edgeStyle('cycle');
    const shared = edgeStyle('shared');

    expect(cycle.stroke).not.toBe(shared.stroke);
    expect(cycle.strokeWidth).toBeGreaterThan(shared.strokeWidth);
  });
});
