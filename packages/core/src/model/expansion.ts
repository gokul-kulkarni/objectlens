/**
 * Expansion state.
 *
 * Which nodes are open is shared by every view, not owned by any one of them — the tree indents
 * under an expanded node, the graph draws its children as cards, and both read the same set. That
 * is the whole reason expansion lives in the app store rather than inside a view, and why these
 * helpers belong in core rather than in the package that happened to need them first.
 *
 * Every function returns a new set. Expansion is replaced, never mutated, so React sees a changed
 * identity and a stale closure cannot quietly write into the live state.
 */

import type { NodeId } from './ids.js';
import type { ObjectGraph } from './graph.js';
import type { Node } from './nodes.js';
import { childrenOf } from '../traversal/children.js';

/**
 * Expansion for first render: enough to show structure, not so much that a big graph arrives as
 * ten thousand rows.
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

/** Toggles one id, returning a new set. */
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
