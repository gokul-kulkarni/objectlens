/**
 * Positioning the visible graph.
 *
 * The IR's containment relation is a tree by construction — `ref` is the *only* way a node can be
 * reached twice — so a tidy-tree layout is exact here, not an approximation. That is why this is
 * hand-written rather than delegated to a general layout engine: the plan called for `elkjs`, but
 * ELK ships ~1.4 MB of compiled Java to solve the general layered-DAG problem, runs asynchronously
 * in its own worker, and would still lay containment out as a tree. Against that, this file is a
 * synchronous pure function of (graph, expanded) that unit tests can assert coordinates on.
 * Reference edges are drawn as overlays and deliberately exert no pull on the layout, so they
 * cannot drag a child away from its parent.
 *
 * Everything here is iterative: a 40k-deep chain is a legitimate paste and recursion would make
 * that a crash rather than a picture.
 */

import { childrenOf, type ChildRelation, type Node, type NodeId, type ObjectGraph } from '@objectlens/core';

/** Card geometry. Fixed rather than measured: layout stays pure, and text elides inside the card. */
export const NODE_WIDTH = 232;
export const NODE_HEIGHT = 48;

/** Distance between the left edges of adjacent depth columns. */
export const COLUMN_STRIDE = NODE_WIDTH + 72;
/** Distance between the top edges of adjacent rows. */
export const ROW_STRIDE = NODE_HEIGHT + 16;

/**
 * Ceiling on drawn cards.
 *
 * Far lower than the tree's 200k because a card is two elements plus an edge path rather than one
 * row, and because a picture of 200k nodes conveys nothing anyway. Hitting it is reported, never
 * silent.
 */
export const MAX_GRAPH_NODES = 1200;

export type NodeRelation = ChildRelation | 'root';

export interface GraphNodeShape {
  readonly id: NodeId;
  readonly node: Node;
  /** How the parent reaches this node: a key literal, an index, a field name. Empty at the root. */
  readonly label: string;
  readonly relation: NodeRelation;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  readonly hasChildren: boolean;
  readonly isExpanded: boolean;
  readonly isMatch: boolean;
  /** Children this node has but the picture does not show, because it is collapsed or capped. */
  readonly hiddenChildCount: number;
}

/**
 * `child` is containment. `shared` and `cycle` are both `ref` nodes pointing back into the graph,
 * kept apart because a cycle is a fact about the data worth seeing at a glance and a DAG join is
 * merely bookkeeping.
 */
export type GraphEdgeKind = 'child' | 'shared' | 'cycle';

export interface GraphEdgeShape {
  readonly id: string;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly kind: GraphEdgeKind;
  /** Shown mid-edge for containment; reference edges carry no label. */
  readonly label: string;
}

export interface GraphLayout {
  readonly nodes: readonly GraphNodeShape[];
  readonly edges: readonly GraphEdgeShape[];
  readonly width: number;
  readonly height: number;
  /** True when the node cap cut the picture short, so the UI can say so rather than mislead. */
  readonly truncated: boolean;
}

export interface LayoutOptions {
  readonly expanded: ReadonlySet<NodeId>;
  readonly matches?: ReadonlySet<NodeId>;
  readonly maxNodes?: number;
}

/** Mutable build record; frozen into a `GraphNodeShape` once its position is known. */
interface Item {
  readonly node: Node;
  readonly label: string;
  readonly relation: NodeRelation;
  readonly depth: number;
  readonly children: number[];
  /** Children of `node` that never became items. */
  hiddenChildCount: number;
  y: number;
}

export function layout(graph: ObjectGraph, options: LayoutOptions): GraphLayout {
  const maxNodes = options.maxNodes ?? MAX_GRAPH_NODES;
  const items = collect(graph, options.expanded, maxNodes);

  if (items.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0, truncated: false };
  }

  assignRows(items);

  const matches = options.matches;
  const nodes = items.map((item) => ({
    id: item.node.id,
    node: item.node,
    label: item.label,
    relation: item.relation,
    depth: item.depth,
    x: item.depth * COLUMN_STRIDE,
    y: item.y,
    hasChildren: item.children.length > 0 || item.hiddenChildCount > 0,
    isExpanded: item.children.length > 0,
    isMatch: matches?.has(item.node.id) ?? false,
    hiddenChildCount: item.hiddenChildCount,
  }));

  const truncated = items.some((item) => item.hiddenChildCount > 0 && options.expanded.has(item.node.id));

  return {
    nodes,
    edges: buildEdges(items, nodes),
    width: maxOf(nodes, (n) => n.x) + NODE_WIDTH,
    height: maxOf(nodes, (n) => n.y) + NODE_HEIGHT,
    truncated,
  };
}

/**
 * Breadth-first collection of the visible subtree.
 *
 * Breadth-first so that when the cap bites it is the deepest levels that go missing, not an
 * arbitrary branch — the shallow structure a reader orients by survives intact.
 */
function collect(graph: ObjectGraph, expanded: ReadonlySet<NodeId>, maxNodes: number): Item[] {
  if (maxNodes <= 0) return [];

  const items: Item[] = [
    { node: graph.root, label: '', relation: 'root', depth: 0, children: [], hiddenChildCount: 0, y: 0 },
  ];

  // Index into `items` of the next node whose children to consider — a queue head, so the walk
  // stays O(n) instead of paying for a shift() per node.
  for (let head = 0; head < items.length; head += 1) {
    const item = items[head];
    if (item === undefined) continue;
    if (!expanded.has(item.node.id)) {
      item.hiddenChildCount = childrenOf(item.node).length;
      continue;
    }

    const children = childrenOf(item.node);
    for (const child of children) {
      if (items.length >= maxNodes) {
        item.hiddenChildCount += 1;
        continue;
      }

      item.children.push(items.length);
      items.push({
        node: child.node,
        label: child.label,
        relation: child.relation,
        depth: item.depth + 1,
        children: [],
        hiddenChildCount: 0,
        y: 0,
      });
    }
  }

  return items;
}

/**
 * Reingold–Tilford row assignment, iterative post-order: leaves take the next free row, parents
 * centre on the span of their children. With one column per depth this is the whole layout.
 */
function assignRows(items: Item[]): void {
  let cursor = 0;
  const stack: { index: number; nextChild: number }[] = [{ index: 0, nextChild: 0 }];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame === undefined) break;

    const item = items[frame.index];
    if (item === undefined) {
      stack.pop();
      continue;
    }

    if (frame.nextChild < item.children.length) {
      const childIndex = item.children[frame.nextChild];
      frame.nextChild += 1;
      if (childIndex !== undefined) stack.push({ index: childIndex, nextChild: 0 });
      continue;
    }

    if (item.children.length === 0) {
      item.y = cursor;
      cursor += ROW_STRIDE;
    } else {
      const first = items[item.children[0] ?? 0]?.y ?? 0;
      const last = items[item.children[item.children.length - 1] ?? 0]?.y ?? 0;
      item.y = (first + last) / 2;
    }

    stack.pop();
  }
}

function buildEdges(items: readonly Item[], nodes: readonly GraphNodeShape[]): GraphEdgeShape[] {
  const edges: GraphEdgeShape[] = [];
  const drawn = new Set(nodes.map((node) => node.id));

  items.forEach((item, index) => {
    for (const childIndex of item.children) {
      const child = items[childIndex];
      if (child === undefined) continue;
      edges.push({
        id: `child:${item.node.id}->${child.node.id}`,
        source: item.node.id,
        target: child.node.id,
        kind: 'child',
        label: child.label,
      });
    }

    const node = item.node;
    if (node.kind !== 'ref') return;

    // A ref whose target is collapsed away has nothing to point at. Drawing it to nowhere would
    // be worse than omitting it — the card still says "cycle"/"shared", so nothing is lost.
    if (!drawn.has(node.target)) return;

    edges.push({
      id: `ref:${node.id}->${node.target}@${index}`,
      source: node.id,
      target: node.target,
      kind: node.cycle ? 'cycle' : 'shared',
      label: '',
    });
  });

  return edges;
}

function maxOf<T>(values: readonly T[], pick: (value: T) => number): number {
  let max = 0;
  for (const value of values) {
    const candidate = pick(value);
    if (candidate > max) max = candidate;
  }
  return max;
}
