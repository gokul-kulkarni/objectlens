/**
 * A {@link NodeSource} over an already-parsed graph.
 *
 * Everything is resolved, so the promises settle immediately — but they are still promises,
 * because the point of the interface is that a view cannot tell this apart from a remote source.
 */

import type { Node } from '../model/nodes.js';
import type { NodeId } from '../model/ids.js';
import type { ObjectGraph } from '../model/graph.js';
import { childrenOf } from '../traversal/children.js';
import type { ChildRange, ChildWindow, NodeSource } from './types.js';

export class InMemoryNodeSource implements NodeSource {
  readonly isSynchronous = true;
  readonly #graph: ObjectGraph;

  constructor(graph: ObjectGraph) {
    this.#graph = graph;
  }

  async getRoot(): Promise<Node> {
    return this.#graph.root;
  }

  async getNode(id: NodeId): Promise<Node | undefined> {
    return this.#graph.nodesById.get(id);
  }

  async getChildren(id: NodeId, range?: ChildRange): Promise<ChildWindow> {
    const node = this.#graph.nodesById.get(id);
    if (node === undefined) {
      return { children: [], totalCount: 0, offset: range?.offset ?? 0 };
    }

    const all = childrenOf(node);
    if (range === undefined) {
      return { children: all, totalCount: all.length, offset: 0 };
    }

    const offset = Math.max(0, range.offset);
    return {
      children: all.slice(offset, offset + Math.max(0, range.limit)),
      totalCount: all.length,
      offset,
    };
  }
}
