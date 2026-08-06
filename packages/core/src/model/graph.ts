/**
 * A parsed object graph: a root node plus the indexes views need to be fast.
 *
 * Adapters build the tree; `buildGraph` derives everything else. Keeping the index out of the
 * adapters means a new adapter cannot forget to build one, or build one inconsistently.
 */

import type { Node } from './nodes.js';
import type { NodeId, SourceId } from './ids.js';
import type { Diagnostic } from './diagnostics.js';
import { parseWarning } from './diagnostics.js';
import { childrenOf } from '../traversal/children.js';

export interface ObjectGraph {
  readonly root: Node;
  readonly source: SourceId;
  /** Every node by id. Backs ref resolution, selection, and search result lookup. */
  readonly nodesById: ReadonlyMap<NodeId, Node>;
  /** Parent of each node, for breadcrumbs and reveal-in-tree. The root is absent. */
  readonly parentById: ReadonlyMap<NodeId, NodeId>;
  /**
   * How each node is labelled by its parent — a dict key, an index, a field name. Computed here
   * because breadcrumbs, search, and graph captions all need it and would otherwise each rebuild it.
   */
  readonly labelById: ReadonlyMap<NodeId, string>;
  readonly diagnostics: readonly Diagnostic[];
  /** True when depth or size limits cut the walk short, so the UI can say so honestly. */
  readonly truncated: boolean;
}

export interface BuildGraphOptions {
  readonly diagnostics?: readonly Diagnostic[];
  readonly truncated?: boolean;
}

export function buildGraph(
  root: Node,
  source: SourceId,
  options: BuildGraphOptions = {},
): ObjectGraph {
  const nodesById = new Map<NodeId, Node>();
  const parentById = new Map<NodeId, NodeId>();
  const labelById = new Map<NodeId, string>();
  const duplicates: NodeId[] = [];

  // Iterative, not recursive: a 40k-deep linked list is a legitimate paste, and overflowing the
  // stack on it would be a crash rather than a diagnostic.
  const stack: Node[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;

    if (nodesById.has(node.id)) {
      duplicates.push(node.id);
      continue;
    }
    nodesById.set(node.id, node);

    // `ref` nodes point at already-visited nodes; following them would not terminate.
    if (node.kind === 'ref') continue;

    const children = childrenOf(node);
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (child === undefined) continue;
      parentById.set(child.node.id, node.id);
      labelById.set(child.node.id, child.label);
      stack.push(child.node);
    }
  }

  // An adapter allocating ids through `createIdAllocator` cannot get here. If one does, the graph
  // is still usable — first occurrence wins — but the reader deserves to know a node was dropped.
  const collisionDiagnostics = duplicates.map((id) =>
    parseWarning(`Duplicate node id "${id}"; only the first occurrence is shown.`, { nodeId: id }),
  );

  return {
    root,
    source,
    nodesById,
    parentById,
    labelById,
    diagnostics: [...(options.diagnostics ?? []), ...collisionDiagnostics],
    truncated: options.truncated ?? false,
  };
}

/** Ids from the root down to `id` inclusive. Empty if `id` is not in the graph. */
export function pathTo(graph: ObjectGraph, id: NodeId): readonly NodeId[] {
  if (!graph.nodesById.has(id)) return [];

  const path: NodeId[] = [id];
  let current = graph.parentById.get(id);

  while (current !== undefined) {
    path.push(current);
    current = graph.parentById.get(current);
  }

  return path.reverse();
}

/** Every ancestor of `id`, root first, excluding `id` itself. What the tree must expand to reveal it. */
export function ancestorsOf(graph: ObjectGraph, id: NodeId): readonly NodeId[] {
  return pathTo(graph, id).slice(0, -1);
}

/**
 * Follows a `ref` to the node it points at. Returns `undefined` for a dangling target, which is
 * possible when a snapshot was truncated mid-walk.
 */
export function resolveRef(graph: ObjectGraph, node: Node): Node | undefined {
  return node.kind === 'ref' ? graph.nodesById.get(node.target) : node;
}
