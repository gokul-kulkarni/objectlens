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
