/**
 * Structural diff of two object graphs.
 *
 * Two passes. The first walks both trees together, top-down, deciding what each position *is*
 * (added, removed, a changed leaf, a container to descend into). The second runs bottom-up over
 * the same nodes in reverse, rolling child statuses and counts up into their parents. Both are
 * iterative: a 40k-deep linked list is a legitimate input, and comparing it must not overflow.
 *
 * Refs are compared by the *path* of what they point at, never followed, so cycles terminate and
 * two graphs that share the same structure compare equal however their ids were spelled.
 */

import {
  ROOT_ID,
  disambiguate,
  isContainer,
  pathTo,
  type ContainerNode,
  type Node,
  type ObjectGraph,
  type RefNode,
} from '@objectlens/core';
import { canonicalText, opaqueKey, scalarKey } from './canonical.js';
import { pairChildren, type Pair } from './match.js';
import type { DiffCounts, DiffNode, DiffOptions, DiffResult, DiffStatus } from './types.js';

const DEFAULT_MAX_NODES = 200_000;

const ZERO: DiffCounts = { added: 0, removed: 0, changed: 0 };

/** What the top-down pass knows about a position. Children are filled in as they are visited. */
interface Draft {
  readonly pair: Pair;
  /** Settled for leaves and one-sided subtrees; `undefined` means "roll up from children". */
  readonly own: Exclude<DiffStatus, 'modified'> | undefined;
  readonly typeChanged: boolean;
  readonly children: number[];
}

interface Walk {
  readonly left: ObjectGraph;
  readonly right: ObjectGraph;
  readonly arrayKey: string | undefined;
  readonly maxNodes: number;
  readonly drafts: Draft[];
  readonly ids: Set<string>;
  readonly notes: string[];
  truncated: boolean;
}

export function diffGraphs(
  left: ObjectGraph,
  right: ObjectGraph,
  options: DiffOptions = {},
): DiffResult {
  const walk: Walk = {
    left,
    right,
    arrayKey: options.arrayKey?.trim() || undefined,
    maxNodes: options.maxNodes ?? DEFAULT_MAX_NODES,
    drafts: [],
    ids: new Set(),
    notes: [],
    truncated: false,
  };

  const rootPair: Pair = { label: '', relation: 'value', id: ROOT_ID, left: left.root, right: right.root };
  const stack: { pair: Pair; parent: number }[] = [{ pair: rootPair, parent: -1 }];

  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry === undefined) break;

    const index = walk.drafts.length;
    const children = visit(walk, entry.pair);
    walk.drafts.push(children.draft);
    walk.drafts[entry.parent]?.children.push(index);

    // Reversed so they pop — and therefore appear — in order.
    for (let i = children.pairs.length - 1; i >= 0; i -= 1) {
      const pair = children.pairs[i];
      if (pair !== undefined) stack.push({ pair, parent: index });
    }
  }

  const root = rollUp(walk.drafts);
  return { root, counts: root.counts, truncated: walk.truncated, notes: walk.notes };
}

/** Classifies one position and returns the child positions still to visit. */
function visit(walk: Walk, pair: Pair): { draft: Draft; pairs: readonly Pair[] } {
  const id = uniqueId(walk.ids, pair.id);
  const identified = id === pair.id ? pair : { ...pair, id };
  const { left, right } = identified;

  const draft = (own: Draft['own'], typeChanged = false): Draft => ({
    pair: identified,
    own,
    typeChanged,
    children: [],
  });

  if (left === undefined || right === undefined) {
    const status = left === undefined ? 'added' : 'removed';
    const present = (left ?? right) as Node;
    return { draft: draft(status), pairs: descend(walk, id, oneSided(present, status)) };
  }

  if (left.kind !== right.kind) return { draft: draft('changed', true), pairs: [] };

  switch (left.kind) {
    case 'scalar': {
      const other = right as typeof left;
      const typeChanged = left.scalarType !== other.scalarType;
      const equal = !typeChanged && scalarKey(left) === scalarKey(other);
      return { draft: draft(equal ? 'same' : 'changed', typeChanged), pairs: [] };
    }

    case 'opaque':
      return { draft: draft(opaqueKey(left) === opaqueKey(right as typeof left) ? 'same' : 'changed'), pairs: [] };

    case 'ref': {
      const equal = refTarget(walk.left, left) === refTarget(walk.right, right as RefNode);
      return { draft: draft(equal ? 'same' : 'changed'), pairs: [] };
    }

    default: {
      const other = right as ContainerNode;
      // Type names are each language's own vocabulary — Python's `dict` and JSON's object are
      // the same container — so they are only comparable when both sides share a format.
      const typeChanged = left.source === other.source && (left.typeName ?? '') !== (other.typeName ?? '');
      const own = typeChanged ? 'changed' : undefined;

      if (walk.drafts.length >= walk.maxNodes) {
        walk.truncated = true;
        // Out of budget: settle the subtree by its (bounded) canonical text instead of walking it.
        const equal = canonicalText(left) === canonicalText(other);
        return { draft: draft(own ?? (equal ? 'same' : 'changed'), typeChanged), pairs: [] };
      }

      const result = pairChildren(id, left, other, walk.arrayKey);
      if (result.note !== undefined) walk.notes.push(`${id}: ${result.note}`);
      return { draft: draft(own, typeChanged), pairs: result.pairs };
    }
  }
}

/** Children of a subtree that exists on one side only, so it can still be expanded and read. */
function oneSided(node: Node, status: 'added' | 'removed'): { left?: ContainerNode; right?: ContainerNode } {
  if (!isContainer(node)) return {};
  return status === 'added' ? { right: node } : { left: node };
}

function descend(
  walk: Walk,
  id: string,
  sides: { left?: ContainerNode; right?: ContainerNode },
): readonly Pair[] {
  if (sides.left === undefined && sides.right === undefined) return [];
  if (walk.drafts.length >= walk.maxNodes) {
    walk.truncated = true;
    return [];
  }
  return pairChildren(id, sides.left, sides.right).pairs;
}

/** Where a ref points, as a path of labels — comparable across graphs whose ids differ. */
function refTarget(graph: ObjectGraph, node: RefNode): string {
  const path = pathTo(graph, node.target);
  if (path.length === 0) return `dangling:${node.target}`;
  const labels = path.slice(1).map((id) => graph.labelById.get(id) ?? '?');
  return `${node.cycle ? 'cycle' : 'shared'}:/${labels.join('/')}`;
}

function uniqueId(ids: Set<string>, id: string): string {
  let candidate = id;
  for (let attempt = 2; ids.has(candidate); attempt += 1) candidate = disambiguate(id, attempt);
  ids.add(candidate);
  return candidate;
}

/**
 * Bottom-up pass. Drafts are in pre-order, so walking them backwards meets every child before
 * its parent, and each parent can be built from already-final children.
 */
function rollUp(drafts: readonly Draft[]): DiffNode {
  const built: DiffNode[] = new Array<DiffNode>(drafts.length);

  for (let i = drafts.length - 1; i >= 0; i -= 1) {
    const draft = drafts[i];
    if (draft === undefined) continue;

    const children = draft.children.map((child) => built[child] as DiffNode);
    const status = statusOf(draft, children);
    const { pair } = draft;

    built[i] = {
      id: pair.id,
      label: pair.label,
      relation: i === 0 ? 'root' : pair.relation,
      status,
      ...(pair.left === undefined ? {} : { left: pair.left }),
      ...(pair.right === undefined ? {} : { right: pair.right }),
      ...(draft.typeChanged ? { typeChanged: true } : {}),
      ...(pair.moved === undefined ? {} : { moved: pair.moved }),
      children,
      counts: countsOf(status, children),
    };
  }

  return built[0] as DiffNode;
}

function statusOf(draft: Draft, children: readonly DiffNode[]): DiffStatus {
  if (draft.own !== undefined) return draft.own;
  return children.some((child) => child.status !== 'same') ? 'modified' : 'same';
}

/**
 * A one-sided subtree counts once, at its top: adding a record of ten fields is one addition, not
 * eleven. A changed container counts itself plus whatever changed inside it.
 */
function countsOf(status: DiffStatus, children: readonly DiffNode[]): DiffCounts {
  switch (status) {
    case 'same':
      return ZERO;
    case 'added':
      return { ...ZERO, added: 1 };
    case 'removed':
      return { ...ZERO, removed: 1 };
    case 'changed':
    case 'modified': {
      const below = children.reduce(
        (sum, child) => ({
          added: sum.added + child.counts.added,
          removed: sum.removed + child.counts.removed,
          changed: sum.changed + child.counts.changed,
        }),
        ZERO,
      );
      return status === 'changed' ? { ...below, changed: below.changed + 1 } : below;
    }
  }
}
