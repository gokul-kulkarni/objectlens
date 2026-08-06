/**
 * Id allocation for adapters.
 *
 * Ids are derived from structural position, so distinct positions normally produce distinct ids.
 * The exception is a map with a repeated key literal — impossible in a live `dict`, but perfectly
 * possible in hand-edited or truncated text that we still want to render.
 *
 * Adapters allocate through this so collisions are resolved *while building*, where the local
 * index is still known. Resolving them afterwards would mean rewriting an immutable tree.
 */

import { disambiguate, type NodeId } from './ids.js';

export interface IdAllocator {
  /** Returns `preferred`, or a disambiguated variant if it is already taken. */
  allocate(preferred: NodeId): NodeId;
  /** Ids that needed disambiguation, for reporting as warnings. */
  readonly collisions: readonly NodeId[];
}

export function createIdAllocator(): IdAllocator {
  const taken = new Set<NodeId>();
  const collisions: NodeId[] = [];

  return {
    allocate(preferred: NodeId): NodeId {
      if (!taken.has(preferred)) {
        taken.add(preferred);
        return preferred;
      }

      collisions.push(preferred);

      let attempt = 2;
      let candidate = disambiguate(preferred, attempt);
      while (taken.has(candidate)) {
        attempt += 1;
        candidate = disambiguate(preferred, attempt);
      }

      taken.add(candidate);
      return candidate;
    },
    get collisions() {
      return collisions;
    },
  };
}
