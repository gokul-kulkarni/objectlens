/**
 * Graph traversal.
 *
 * Iterative rather than recursive throughout: a 40k-deep linked list is a legitimate thing to
 * paste, and blowing the JS stack on it would be a crash rather than a diagnostic.
 */

import type { Node } from '../model/nodes.js';
import { childrenOf } from './children.js';

export interface WalkStep {
  readonly node: Node;
  readonly depth: number;
}

/**
 * Pre-order traversal.
 *
 * `ref` nodes are yielded but never followed — they point at nodes already visited, so following
 * them would not terminate. That is the whole reason `ref` exists as a distinct kind.
 *
 * A step carries no ancestor list on purpose. Materialising one per node makes traversal O(n²) in
 * the depth — a 50k-deep chain costs over a billion element copies, and deep graphs are precisely
 * the pathological input this has to survive. Callers needing a path use `pathTo(graph, id)`,
 * which walks the parent index on demand in O(depth).
 */
export function* walk(root: Node): Generator<WalkStep> {
  const stack: WalkStep[] = [{ node: root, depth: 0 }];

  while (stack.length > 0) {
    const step = stack.pop();
    if (step === undefined) break;

    yield step;

    const children = childrenOf(step.node);

    // Pushed in reverse so the stack pops them left-to-right.
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (child === undefined) continue;
      stack.push({ node: child.node, depth: step.depth + 1 });
    }
  }
}

/** Total node count, refs included. */
export function countNodes(root: Node): number {
  let count = 0;
  for (const _ of walk(root)) count += 1;
  return count;
}

/** Greatest depth below the root, where a lone root is depth 0. */
export function maxDepth(root: Node): number {
  let deepest = 0;
  for (const step of walk(root)) {
    if (step.depth > deepest) deepest = step.depth;
  }
  return deepest;
}
