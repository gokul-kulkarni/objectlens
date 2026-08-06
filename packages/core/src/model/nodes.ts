/**
 * The intermediate representation — the narrow waist of the hourglass.
 *
 * N source adapters produce these; M view plugins consume them. `kind` is a **closed** set that
 * views switch on exhaustively; `typeName` and `meta` are the open escape hatch where a language
 * keeps its own detail. Adding a source language must never require adding a `kind`.
 *
 * Everything is `readonly`. Nodes are built bottom-up and never mutated after construction.
 * We deliberately do *not* `Object.freeze` them: freezing every node in a million-node graph costs
 * real time and blocks JIT optimisation, and `readonly` already catches mutation at compile time,
 * which is where our mutations would come from.
 *
 * See `docs/schema.md` §2–3.
 */

import type { NodeId, SourceId } from './ids.js';

export type NodeKind = 'map' | 'sequence' | 'set' | 'object' | 'scalar' | 'opaque' | 'ref';

export type ScalarType = 'string' | 'int' | 'float' | 'bool' | 'null' | 'bytes' | 'complex';

/** Live mode only: where a field came from, so `dir()` noise stays collapsible. */
export type FieldCategory = 'data' | 'property' | 'method' | 'dunder';

interface NodeBase {
  readonly id: NodeId;
  readonly kind: NodeKind;
  /** The source language's own name for the type: `frozenset`, `HashMap`, `User`. */
  readonly typeName?: string;
  readonly source: SourceId;
  /** Adapter-specific detail. Views may read it; they must never require it. */
  readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * Keys are full nodes, not strings: Python permits `{(1, 2): 'x'}`. Modelling keys as strings
 * would silently corrupt them, so the cost is paid everywhere rather than the data being lossy.
 */
export interface MapEntry {
  readonly key: Node;
  readonly value: Node;
}

export interface MapNode extends NodeBase {
  readonly kind: 'map';
  readonly entries: readonly MapEntry[];
  /** True size. Exceeds `entries.length` when only a window has been loaded. */
  readonly totalCount?: number;
}

export interface SequenceNode extends NodeBase {
  readonly kind: 'sequence';
  readonly items: readonly Node[];
  readonly totalCount?: number;
}

/** Distinct from `sequence` because it renders without meaningful indices. */
export interface SetNode extends NodeBase {
  readonly kind: 'set';
  readonly items: readonly Node[];
  readonly totalCount?: number;
}

export interface ObjectField {
  readonly name: string;
  readonly value: Node;
  readonly category?: FieldCategory;
  /**
   * `true` means the value has **not** been computed and must not be computed automatically.
   * Property getters run arbitrary code with side effects, so evaluation is always user-initiated.
   */
  readonly lazy?: boolean;
}

/**
 * A typed instance. Carries both named fields and positional args so constructor-style reprs
 * survive intact: `Decimal('1.5')` is args-only, `User(id=1)` is fields-only, and both can co-occur.
 */
export interface ObjectNode extends NodeBase {
  readonly kind: 'object';
  readonly fields: readonly ObjectField[];
  readonly args?: readonly Node[];
}

export interface ScalarNode extends NodeBase {
  readonly kind: 'scalar';
  readonly scalarType: ScalarType;
  /** Convenient JS form. Lossy for big integers and impossible for `inf`/`nan` — see `raw`. */
  readonly value: string | number | boolean | null;
  /**
   * Exact source text, authoritative whenever present. Required for `int` (Python bignums and
   * Java `long` exceed `Number.MAX_SAFE_INTEGER`) and for `inf`/`-inf`/`nan`/`-0.0`/`1.50`.
   */
  readonly raw?: string;
}

/** Known to exist, contents unavailable: `<Foo object at 0x7f9a2c>`, `com.acme.Foo@1a2b`. */
export interface OpaqueNode extends NodeBase {
  readonly kind: 'opaque';
  readonly text: string;
  readonly address?: string;
}

/**
 * A pointer to a node already present in the graph — the only way to express sharing.
 *
 * `cycle` distinguishes a back-edge into an ancestor from a mere DAG join. The graph view styles
 * them differently, so the producer computes it; a view cannot recover the distinction on its own.
 */
export interface RefNode extends NodeBase {
  readonly kind: 'ref';
  readonly target: NodeId;
  readonly cycle: boolean;
}

export type Node =
  | MapNode
  | SequenceNode
  | SetNode
  | ObjectNode
  | ScalarNode
  | OpaqueNode
  | RefNode;

/** Nodes that can have children. Narrowing helper for traversal and view code. */
export type ContainerNode = MapNode | SequenceNode | SetNode | ObjectNode;

export function isContainer(node: Node): node is ContainerNode {
  return (
    node.kind === 'map' ||
    node.kind === 'sequence' ||
    node.kind === 'set' ||
    node.kind === 'object'
  );
}

/**
 * Number of children a node reports having, preferring `totalCount` so a partially-loaded
 * container still reports its true size to the UI.
 */
export function childCount(node: Node): number {
  switch (node.kind) {
    case 'map':
      return node.totalCount ?? node.entries.length;
    case 'sequence':
    case 'set':
      return node.totalCount ?? node.items.length;
    case 'object':
      return node.fields.length + (node.args?.length ?? 0);
    default:
      return 0;
  }
}

/** Whether more children exist on the producer than are present on this node. */
export function hasUnloadedChildren(node: Node): boolean {
  switch (node.kind) {
    case 'map':
      return (node.totalCount ?? node.entries.length) > node.entries.length;
    case 'sequence':
    case 'set':
      return (node.totalCount ?? node.items.length) > node.items.length;
    default:
      return false;
  }
}
