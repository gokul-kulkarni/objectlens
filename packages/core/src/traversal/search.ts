/**
 * Search across a graph.
 *
 * Matching is done once here and shared with every view through `ViewProps.matches`, so the tree
 * and the graph highlight identically instead of each rolling their own predicate.
 *
 * A node matches on its own rendered text *or* on the label its parent gave it — searching
 * "users" should find the `users` key, which is a property of the edge rather than of the node.
 */

import type { Node } from '../model/nodes.js';
import type { NodeId } from '../model/ids.js';
import type { ObjectGraph } from '../model/graph.js';
import { ancestorsOf } from '../model/graph.js';

export interface SearchOptions {
  readonly caseSensitive?: boolean;
  /** Stops early on huge graphs; the UI reports the result as partial. */
  readonly maxResults?: number;
}

export interface SearchResult {
  /** Nodes that matched. */
  readonly matches: ReadonlySet<NodeId>;
  /** Matches plus every ancestor — what the tree must expand for the matches to be visible. */
  readonly reveal: ReadonlySet<NodeId>;
  /** True when `maxResults` cut the search short. */
  readonly truncated: boolean;
}

const EMPTY: SearchResult = {
  matches: new Set(),
  reveal: new Set(),
  truncated: false,
};

/** The node's own searchable text — its value, its type name, its opaque repr. */
export function searchableText(node: Node): string {
  switch (node.kind) {
    case 'scalar':
      return `${node.raw ?? String(node.value)} ${node.typeName ?? ''}`;
    case 'opaque':
      return `${node.text} ${node.typeName ?? ''}`;
    case 'object':
      return `${node.typeName ?? ''} ${node.fields.map((f) => f.name).join(' ')}`;
    case 'map':
    case 'sequence':
    case 'set':
    case 'ref':
      return node.typeName ?? '';
  }
}

export function search(
  graph: ObjectGraph,
  query: string,
  options: SearchOptions = {},
): SearchResult {
  const trimmed = query.trim();
  if (trimmed === '') return EMPTY;

  const needle = options.caseSensitive === true ? trimmed : trimmed.toLowerCase();
  const maxResults = options.maxResults ?? Number.POSITIVE_INFINITY;

  const matches = new Set<NodeId>();
  let truncated = false;

  for (const [id, node] of graph.nodesById) {
    if (matches.size >= maxResults) {
      truncated = true;
      break;
    }

    const label = graph.labelById.get(id) ?? '';
    const haystackRaw = `${label} ${searchableText(node)}`;
    const haystack = options.caseSensitive === true ? haystackRaw : haystackRaw.toLowerCase();

    if (haystack.includes(needle)) matches.add(id);
  }

  const reveal = new Set<NodeId>(matches);
  for (const id of matches) {
    for (const ancestor of ancestorsOf(graph, id)) reveal.add(ancestor);
  }

  return { matches, reveal, truncated };
}
