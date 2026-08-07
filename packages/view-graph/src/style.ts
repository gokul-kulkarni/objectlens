/**
 * Colour, by node kind and edge kind.
 *
 * Every value here is a CSS custom property, never a literal — the tokens in the app's stylesheet
 * are the contract, and the tree view resolves the same ones. That is what makes a scalar the same
 * green in both views without either package importing the other.
 *
 * Returned as raw `var(...)` strings rather than Tailwind classes because the edges are SVG paths
 * rendered by the flow canvas, which takes inline stroke values.
 */

import type { Node, NodeKind } from '@objectlens/core';
import type { GraphEdgeKind, NodeRelation } from './layout.js';

export function nodeColor(node: Node): string {
  return kindColor(node.kind);
}

export function kindColor(kind: NodeKind): string {
  switch (kind) {
    case 'scalar':
      return 'var(--color-node-scalar)';
    case 'opaque':
      return 'var(--color-node-opaque)';
    case 'ref':
      return 'var(--color-node-ref)';
    case 'map':
    case 'sequence':
    case 'set':
    case 'object':
      return 'var(--color-node-container)';
  }
}

/** Colour of the edge label, matching how the tree colours the same relation. */
export function relationColor(relation: NodeRelation): string {
  switch (relation) {
    case 'field':
      return 'var(--color-label-field)';
    case 'key':
      return 'var(--color-label-keynode)';
    case 'arg':
    case 'item':
      return 'var(--color-label-index)';
    case 'value':
    case 'root':
      return 'var(--color-label-key)';
  }
}

export interface EdgeStyle {
  readonly stroke: string;
  readonly strokeWidth: number;
  /** SVG dash pattern, or `undefined` for a solid line. */
  readonly strokeDasharray?: string;
}

export function edgeStyle(kind: GraphEdgeKind): EdgeStyle {
  switch (kind) {
    case 'child':
      return { stroke: 'var(--color-line-strong)', strokeWidth: 1.5 };
    case 'shared':
      // Dashed: this edge is a second route to a node drawn elsewhere, not containment.
      return { stroke: 'var(--color-node-ref)', strokeWidth: 1.5, strokeDasharray: '4 4' };
    case 'cycle':
      // Heavier and longer-dashed than a plain share — a cycle is the thing a reader is usually
      // hunting for, and it should be findable without reading any labels.
      return { stroke: 'var(--color-caution)', strokeWidth: 2, strokeDasharray: '8 4' };
  }
}
