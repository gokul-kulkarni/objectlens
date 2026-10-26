/**
 * Turning a diff into what a virtualised tree draws, and into what navigation needs.
 *
 * Pure functions of (diff, expansion, filter) — the same split as the tree view's `flatten`, so
 * the interesting behaviour is testable without mounting React.
 */

import type { DiffNode, DiffResult, DiffStatus } from './types.js';

export interface DiffRow {
  readonly node: DiffNode;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly isExpanded: boolean;
}

export interface FlattenDiffOptions {
  readonly expanded: ReadonlySet<string>;
  /** Hide every `same` position, leaving the changes and the path down to them. */
  readonly onlyChanges?: boolean;
  /** Safety valve so a runaway diff cannot lock the UI thread. */
  readonly maxRows?: number;
}

export interface DiffIndex {
  readonly byId: ReadonlyMap<string, DiffNode>;
  readonly parentById: ReadonlyMap<string, string>;
  /** Ids of the positions that themselves changed, in document order — what next/prev step through. */
  readonly changes: readonly string[];
}

const DEFAULT_MAX_ROWS = 200_000;

/** Statuses that mark a change *at* a position, as opposed to beneath it. */
const CHANGE_STATUSES: ReadonlySet<DiffStatus> = new Set(['added', 'removed', 'changed']);

export function isChange(node: DiffNode): boolean {
  return CHANGE_STATUSES.has(node.status);
}

export function flattenDiff(result: DiffResult, options: FlattenDiffOptions): readonly DiffRow[] {
  const { expanded, onlyChanges = false } = options;
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const rows: DiffRow[] = [];
  const stack: { node: DiffNode; depth: number }[] = [{ node: result.root, depth: 0 }];

  while (stack.length > 0 && rows.length < maxRows) {
    const entry = stack.pop();
    if (entry === undefined) break;

    const children = onlyChanges
      ? entry.node.children.filter((child) => child.status !== 'same')
      : entry.node.children;
    const isExpanded = expanded.has(entry.node.id);

    rows.push({
      node: entry.node,
      depth: entry.depth,
      hasChildren: children.length > 0,
      isExpanded,
    });

    if (!isExpanded) continue;
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (child !== undefined) stack.push({ node: child, depth: entry.depth + 1 });
    }
  }

  return rows;
}

export function indexDiff(result: DiffResult): DiffIndex {
  const byId = new Map<string, DiffNode>();
  const parentById = new Map<string, string>();
  const changes: string[] = [];
  // `inside` marks a node within an added or removed subtree: one change, however many nodes.
  const stack: { node: DiffNode; inside: boolean }[] = [{ node: result.root, inside: false }];

  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry === undefined) break;

    const { node, inside } = entry;
    byId.set(node.id, node);
    if (!inside && isChange(node)) changes.push(node.id);

    const childInside = inside || node.status === 'added' || node.status === 'removed';
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      const child = node.children[i];
      if (child === undefined) continue;
      parentById.set(child.id, node.id);
      stack.push({ node: child, inside: childInside });
    }
  }

  return { byId, parentById, changes };
}

/** Every ancestor of `id`, root first, excluding `id` itself — what must expand to reveal it. */
export function diffAncestors(index: DiffIndex, id: string): readonly string[] {
  const ancestors: string[] = [];
  let current = index.parentById.get(id);
  while (current !== undefined) {
    ancestors.push(current);
    current = index.parentById.get(current);
  }
  return ancestors.reverse();
}

/**
 * Opens the path down to every change, so the first screen of a comparison shows what differs
 * rather than a collapsed root. Capped, because a diff with 50k changes should not try to open
 * 50k containers at once.
 */
export function initialDiffExpansion(result: DiffResult, cap = 2_000): ReadonlySet<string> {
  const expanded = new Set<string>([result.root.id]);
  const stack: DiffNode[] = [result.root];

  while (stack.length > 0 && expanded.size < cap) {
    const node = stack.pop();
    if (node === undefined) break;

    for (const child of node.children) {
      const opens = child.status === 'modified' || (child.status === 'changed' && child.children.length > 0);
      if (opens && expanded.size < cap) {
        expanded.add(child.id);
        stack.push(child);
      }
    }
  }

  return expanded;
}
