/**
 * Flattening the graph into the visible row list.
 *
 * The tree is virtualised, so rendering needs a flat array of exactly the rows currently visible —
 * expansion state applied, collapsed subtrees excluded. Keeping this a pure function of
 * (graph, expanded, filter) means the interesting logic is testable without mounting React.
 */

import {
  childrenOf,
  type ChildRelation,
  type Node,
  type NodeId,
  type ObjectGraph,
} from '@objectlens/core';

export interface TreeRow {
  readonly node: Node;
  readonly label: string;
  readonly relation: ChildRelation | 'root';
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly isExpanded: boolean;
  /** True when this row matches the active search. */
  readonly isMatch: boolean;
}

export interface FlattenOptions {
  readonly expanded: ReadonlySet<NodeId>;
  readonly matches?: ReadonlySet<NodeId>;
  /**
   * When set, only these ids (and their ancestors) are shown — the "filter to matches" mode.
   * Distinct from `matches`, which only highlights.
   */
  readonly visible?: ReadonlySet<NodeId>;
  /** Safety valve so a runaway graph cannot lock the UI thread. */
  readonly maxRows?: number;
}

const DEFAULT_MAX_ROWS = 200_000;

export function flatten(graph: ObjectGraph, options: FlattenOptions): readonly TreeRow[] {
  const { expanded, matches, visible } = options;
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const rows: TreeRow[] = [];

  // Iterative with an explicit stack: a deep graph must not overflow, and this runs on every
  // expand/collapse, so it stays allocation-light.
  const stack: { node: Node; label: string; relation: ChildRelation | 'root'; depth: number }[] = [
    { node: graph.root, label: '', relation: 'root', depth: 0 },
  ];

  while (stack.length > 0 && rows.length < maxRows) {
    const entry = stack.pop();
    if (entry === undefined) break;

    const children = childrenOf(entry.node);
    const isExpanded = expanded.has(entry.node.id);

    rows.push({
      node: entry.node,
      label: entry.label,
      relation: entry.relation,
      depth: entry.depth,
      hasChildren: children.length > 0,
      isExpanded,
      isMatch: matches?.has(entry.node.id) ?? false,
    });

    if (!isExpanded || children.length === 0) continue;

    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (child === undefined) continue;
      if (visible !== undefined && !visible.has(child.node.id)) continue;

      stack.push({
        node: child.node,
        label: child.label,
        relation: child.relation,
        depth: entry.depth + 1,
      });
    }
  }

  return rows;
}

/**
 * Expansion state for first render: enough to show structure, not so much that a big graph
 * arrives as ten thousand rows.
 */
export function initialExpansion(graph: ObjectGraph, maxNodes = 50): ReadonlySet<NodeId> {
  const expanded = new Set<NodeId>();
  const queue: Node[] = [graph.root];
  let budget = maxNodes;

  // Breadth-first, so the budget is spent on the shallow levels a reader looks at first.
  while (queue.length > 0 && budget > 0) {
    const node = queue.shift();
    if (node === undefined) break;

    const children = childrenOf(node);
    if (children.length === 0) continue;

    expanded.add(node.id);
    budget -= children.length;

    for (const child of children) queue.push(child.node);
  }

  return expanded;
}

/** Toggles one id, returning a new set — expansion state is replaced, never mutated. */
export function toggle(expanded: ReadonlySet<NodeId>, id: NodeId): ReadonlySet<NodeId> {
  const next = new Set(expanded);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** Adds every id, returning a new set. Used to reveal search matches. */
export function expandAll(
  expanded: ReadonlySet<NodeId>,
  ids: Iterable<NodeId>,
): ReadonlySet<NodeId> {
  const next = new Set(expanded);
  for (const id of ids) next.add(id);
  return next;
}
