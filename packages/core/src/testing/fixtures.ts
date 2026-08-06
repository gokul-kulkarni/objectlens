/**
 * Terse node builders for tests.
 *
 * Exported from the package (not confined to `__tests__`) because adapter and view packages need
 * the same fixtures, and duplicating them per package is how three subtly different notions of a
 * "valid node" come into existence.
 */

import type {
  MapEntry,
  MapNode,
  Node,
  ObjectField,
  ObjectNode,
  OpaqueNode,
  RefNode,
  ScalarNode,
  ScalarType,
  SequenceNode,
  SetNode,
} from '../model/nodes.js';
import type { NodeId, SourceId } from '../model/ids.js';

export const TEST_SOURCE: SourceId = 'test';

export function str(id: NodeId, value: string): ScalarNode {
  return { id, kind: 'scalar', source: TEST_SOURCE, scalarType: 'string', value };
}

export function int(id: NodeId, value: number, raw?: string): ScalarNode {
  return {
    id,
    kind: 'scalar',
    source: TEST_SOURCE,
    scalarType: 'int',
    value,
    ...(raw === undefined ? {} : { raw }),
  };
}

export function scalar(
  id: NodeId,
  scalarType: ScalarType,
  value: string | number | boolean | null,
  raw?: string,
): ScalarNode {
  return {
    id,
    kind: 'scalar',
    source: TEST_SOURCE,
    scalarType,
    value,
    ...(raw === undefined ? {} : { raw }),
  };
}

export function seq(id: NodeId, items: readonly Node[], totalCount?: number): SequenceNode {
  return {
    id,
    kind: 'sequence',
    source: TEST_SOURCE,
    items,
    ...(totalCount === undefined ? {} : { totalCount }),
  };
}

export function set(id: NodeId, items: readonly Node[], totalCount?: number): SetNode {
  return {
    id,
    kind: 'set',
    source: TEST_SOURCE,
    items,
    ...(totalCount === undefined ? {} : { totalCount }),
  };
}

export function map(id: NodeId, entries: readonly MapEntry[], totalCount?: number): MapNode {
  return {
    id,
    kind: 'map',
    source: TEST_SOURCE,
    entries,
    ...(totalCount === undefined ? {} : { totalCount }),
  };
}

export function entry(key: Node, value: Node): MapEntry {
  return { key, value };
}

export function obj(
  id: NodeId,
  typeName: string,
  fields: readonly ObjectField[] = [],
  args?: readonly Node[],
): ObjectNode {
  return {
    id,
    kind: 'object',
    source: TEST_SOURCE,
    typeName,
    fields,
    ...(args === undefined ? {} : { args }),
  };
}

export function field(name: string, value: Node, extra: Partial<ObjectField> = {}): ObjectField {
  return { name, value, ...extra };
}

export function opaque(id: NodeId, text: string, address?: string): OpaqueNode {
  return {
    id,
    kind: 'opaque',
    source: TEST_SOURCE,
    text,
    ...(address === undefined ? {} : { address }),
  };
}

export function ref(id: NodeId, target: NodeId, cycle = false): RefNode {
  return { id, kind: 'ref', source: TEST_SOURCE, target, cycle };
}

/**
 * A linked list `depth` links long, for exercising traversal against stack limits.
 *
 * Ids are counter-based rather than true nested paths (`$[0][0]…`): a real path at depth 50k is
 * 150k characters, and building each one by repetition makes fixture construction quadratic —
 * which would measure the fixture rather than the traversal. Only uniqueness matters here.
 */
export function deepChain(depth: number): Node {
  let node: Node = str(`$@chain${depth}`, 'leaf');
  for (let i = depth - 1; i >= 0; i -= 1) {
    node = seq(`$@chain${i}`, [node]);
  }
  return node;
}
