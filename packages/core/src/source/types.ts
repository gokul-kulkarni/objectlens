/**
 * Where children come from.
 *
 * This is the abstraction that makes live and static mode indistinguishable to views. A parsed
 * paste resolves everything up front; a live Python process pages children over HTTP. Views only
 * ever call these methods, so they never learn which mode they are in — and the live/static split
 * disappears entirely from the view layer.
 *
 * See `docs/schema.md` §3 (`totalCount`) and §7 (the HTTP API this fronts).
 */

import type { Node } from '../model/nodes.js';
import type { NodeId } from '../model/ids.js';
import type { ChildRef } from '../traversal/children.js';

export interface ChildWindow {
  readonly children: readonly ChildRef[];
  /** True number of children, which may exceed `children.length`. */
  readonly totalCount: number;
  readonly offset: number;
}

export interface ChildRange {
  readonly offset: number;
  readonly limit: number;
}

export interface NodeSource {
  /** Whether children arrive synchronously. Lets views skip loading states when they never occur. */
  readonly isSynchronous: boolean;

  getRoot(): Promise<Node>;
  getNode(id: NodeId): Promise<Node | undefined>;

  /** A window of children. Omitting `range` requests all of them. */
  getChildren(id: NodeId, range?: ChildRange): Promise<ChildWindow>;

  /**
   * Forces evaluation of a `lazy` field — a Python `@property`, typically.
   *
   * Always user-initiated: property getters run arbitrary code with side effects, so nothing in
   * the UI may call this implicitly. Sources without lazy fields may leave it undefined.
   */
  evaluate?(id: NodeId, fieldName: string): Promise<Node>;
}
