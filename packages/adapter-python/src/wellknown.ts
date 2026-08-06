/**
 * Normalising well-known stdlib containers.
 *
 * These repr as constructor calls, so the general parser would render them as `object` nodes with
 * a dict buried in `args[0]` — technically faithful and practically useless. A `Counter` is a
 * mapping and the reader wants to browse it as one.
 *
 * Deliberately a short, closed list of stdlib types whose repr shape is stable. Anything not here
 * stays an honest `object` node rather than being guessed at.
 */

import type { Node, NodeId, SourceId } from '@objectlens/core';

export interface CallShape {
  readonly callee: string;
  readonly args: readonly Node[];
  readonly kwargs: readonly { readonly name: string; readonly value: Node }[];
}

/**
 * Rewrites a recognised call into the container it actually is, or returns `undefined` to leave
 * it as a generic object node.
 *
 * `id` and `source` are carried over so paths and provenance survive the rewrite.
 */
export function normaliseWellKnown(
  id: NodeId,
  source: SourceId,
  call: CallShape,
): Node | undefined {
  const name = lastSegment(call.callee);

  switch (name) {
    case 'set':
    case 'frozenset':
      return asSet(id, source, name, call);

    case 'OrderedDict':
    case 'Counter':
    case 'defaultdict':
      return asMap(id, source, name, call);

    default:
      return undefined;
  }
}

/** `set()` is empty; `frozenset({1, 2})` wraps a brace-set the parser already built. */
function asSet(id: NodeId, source: SourceId, typeName: string, call: CallShape): Node | undefined {
  if (call.kwargs.length > 0) return undefined;

  if (call.args.length === 0) {
    return { id, kind: 'set', source, typeName, items: [] };
  }

  const inner = call.args[0];
  if (call.args.length !== 1 || inner === undefined) return undefined;

  // `frozenset({1, 2})` — adopt the inner set's items under this node's id.
  if (inner.kind === 'set' || inner.kind === 'sequence') {
    return { id, kind: 'set', source, typeName, items: rebaseAll(inner.items, inner.id, id) };
  }

  return undefined;
}

/**
 * Rewrites ids after a container is adopted out of a constructor argument.
 *
 * The parser gave the argument a positional id (`$['counter']@arg0`), because it could not know
 * the call was a mapping until the callee was matched. Left alone, every entry inherits that
 * `@arg0` segment and is reported as having no access expression — but `counter['a']` is perfectly
 * good Python. Rebasing restores the paths the reader can actually paste.
 */
function rebase(node: Node, from: NodeId, to: NodeId): Node {
  const id = node.id.startsWith(from) ? to + node.id.slice(from.length) : node.id;

  switch (node.kind) {
    case 'map':
      return {
        ...node,
        id,
        entries: node.entries.map((entry) => ({
          key: rebase(entry.key, from, to),
          value: rebase(entry.value, from, to),
        })),
      };

    case 'sequence':
    case 'set':
      return { ...node, id, items: rebaseAll(node.items, from, to) };

    case 'object':
      return {
        ...node,
        id,
        fields: node.fields.map((field) => ({ ...field, value: rebase(field.value, from, to) })),
        ...(node.args === undefined ? {} : { args: rebaseAll(node.args, from, to) }),
      };

    case 'ref':
      // A cycle pointing into the adopted subtree has to follow it.
      return {
        ...node,
        id,
        target: node.target.startsWith(from) ? to + node.target.slice(from.length) : node.target,
      };

    default:
      return { ...node, id };
  }
}

function rebaseAll(nodes: readonly Node[], from: NodeId, to: NodeId): readonly Node[] {
  return nodes.map((node) => rebase(node, from, to));
}

/**
 * `OrderedDict({'a': 1})`, `Counter({'a': 2})`, `defaultdict(<class 'int'>, {'a': 1})`.
 *
 * The mapping is the last positional argument; `defaultdict` puts its factory first, which is
 * preserved in `meta` rather than dropped — it is genuinely useful when debugging one.
 */
function asMap(id: NodeId, source: SourceId, typeName: string, call: CallShape): Node | undefined {
  if (call.kwargs.length > 0 || call.args.length === 0) {
    // A bare `defaultdict(int)` or `Counter()` has no mapping to adopt.
    return call.args.length === 0
      ? { id, kind: 'map', source, typeName, entries: [] }
      : undefined;
  }

  const mapping = call.args[call.args.length - 1];
  if (mapping === undefined || mapping.kind !== 'map') return undefined;

  const extras = call.args.slice(0, -1);
  const meta = extras.length > 0 ? { defaultFactory: describeNode(extras[0]) } : undefined;

  return {
    id,
    kind: 'map',
    source,
    typeName,
    entries: mapping.entries.map((entry) => ({
      key: rebase(entry.key, mapping.id, id),
      value: rebase(entry.value, mapping.id, id),
    })),
    ...(meta === undefined ? {} : { meta }),
  };
}

function describeNode(node: Node | undefined): string {
  if (node === undefined) return 'unknown';
  if (node.kind === 'opaque') return node.typeName ?? node.text;
  if (node.kind === 'scalar') return String(node.value);
  return node.typeName ?? node.kind;
}

function lastSegment(dotted: string): string {
  const index = dotted.lastIndexOf('.');
  return index === -1 ? dotted : dotted.slice(index + 1);
}
