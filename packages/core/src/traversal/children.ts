/**
 * Uniform child enumeration.
 *
 * Views iterate children through this rather than switching on `kind` themselves, so a view
 * written before `set` existed keeps working when `set` arrives. It is also the single place
 * that decides how a dict entry is presented.
 */

import type { Node } from '../model/nodes.js';

export type ChildRelation = 'value' | 'key' | 'item' | 'field' | 'arg';

export interface ChildRef {
  readonly node: Node;
  /** What the tree shows to the left of the value: a key literal, an index, a field name. */
  readonly label: string;
  readonly relation: ChildRelation;
  /** Position within this relation, used for stable ordering and `@`-form ids. */
  readonly index: number;
}

/**
 * Renders a node compactly enough to serve as a dict-key label.
 *
 * Only scalars get an inline rendering; anything structural returns `null`, which is the signal
 * to surface the key as its own explorable child instead of flattening it to `[object Object]`.
 */
export function keyLabel(node: Node): string | null {
  if (node.kind === 'scalar') {
    if (node.scalarType === 'string') return String(node.value);
    return node.raw ?? String(node.value);
  }
  if (node.kind === 'opaque') return node.text;
  return null;
}

export function childrenOf(node: Node): readonly ChildRef[] {
  switch (node.kind) {
    case 'map':
      return mapChildren(node);

    case 'sequence':
      return node.items.map((child, index) => ({
        node: child,
        label: String(index),
        relation: 'item' as const,
        index,
      }));

    case 'set':
      // Sets are unordered, so the index is a position in our rendering, not an accessor.
      return node.items.map((child, index) => ({
        node: child,
        label: '•',
        relation: 'item' as const,
        index,
      }));

    case 'object':
      return objectChildren(node);

    case 'scalar':
    case 'opaque':
    case 'ref':
      return [];
  }
}

function mapChildren(node: Extract<Node, { kind: 'map' }>): readonly ChildRef[] {
  const refs: ChildRef[] = [];

  node.entries.forEach((entry, index) => {
    const label = keyLabel(entry.key);

    if (label === null) {
      // A structural key — `{(1, 2): 'x'}`. Surface it as its own row so it stays explorable,
      // then the value follows. The labels are bracketed rather than numbered: an index here
      // reads as a key *named* "6", which is exactly the confusion to avoid.
      refs.push({ node: entry.key, label: '⟨key⟩', relation: 'key', index });
      refs.push({ node: entry.value, label: '⟨value⟩', relation: 'value', index });
      return;
    }

    refs.push({ node: entry.value, label, relation: 'value', index });
  });

  return refs;
}

function objectChildren(node: Extract<Node, { kind: 'object' }>): readonly ChildRef[] {
  const args = (node.args ?? []).map((child, index) => ({
    node: child,
    label: String(index),
    relation: 'arg' as const,
    index,
  }));

  const fields = node.fields.map((field, index) => ({
    node: field.value,
    label: field.name,
    relation: 'field' as const,
    index,
  }));

  // Positional args precede named fields, matching how the source repr read.
  return [...args, ...fields];
}
