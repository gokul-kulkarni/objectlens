/**
 * Node identity and path construction.
 *
 * A {@link NodeId} is the structural path from the root. Where the source language has a legal
 * access expression for a position, the id *is* that expression (`$["users"][0].name`), so
 * "copy path" is a field read rather than a separate computation.
 *
 * Positions with no addressable expression — set members, dict keys, positional constructor
 * args — use `@`-prefixed segments instead. That prefix is the signal to disable "copy path"
 * rather than hand the user an expression that would not evaluate.
 *
 * See `docs/schema.md` §4.
 */

export type NodeId = string;

/** Identifies the adapter that produced a node, e.g. `python-repr`, `json`. */
export type SourceId = string;

export const ROOT_ID: NodeId = '$';

/** Marks segments that are structural positions rather than access expressions. */
const OPAQUE_SEGMENT_MARKER = '@';

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

export function isIdentifier(name: string): boolean {
  return IDENTIFIER_RE.test(name);
}

/** `$["users"]` — `keyLiteral` is pre-rendered in the *source language's* syntax. */
export function keyChild(parent: NodeId, keyLiteral: string): NodeId {
  return `${parent}[${keyLiteral}]`;
}

/** `$["users"][0]` */
export function indexChild(parent: NodeId, index: number): NodeId {
  return `${parent}[${index}]`;
}

/**
 * `$.name`, or `$@field(odd name)` when the attribute is not a plain identifier — reachable in
 * Python via `setattr(obj, "odd name", …)`, so it is not merely theoretical.
 */
export function fieldChild(parent: NodeId, name: string): NodeId {
  return isIdentifier(name)
    ? `${parent}.${name}`
    : `${parent}${OPAQUE_SEGMENT_MARKER}field(${name})`;
}

/** `$@arg0` — positional constructor argument of an `object` node. */
export function argChild(parent: NodeId, index: number): NodeId {
  return `${parent}${OPAQUE_SEGMENT_MARKER}arg${index}`;
}

/** `$@key0` — the *key* of a map entry, which is itself a node and needs its own id. */
export function keyNodeChild(parent: NodeId, index: number): NodeId {
  return `${parent}${OPAQUE_SEGMENT_MARKER}key${index}`;
}

/**
 * `$@value0` — the *value* of a map entry whose key has no literal form, as in `{(1, 2): 'x'}`.
 *
 * Distinct from {@link keyChild}: there is no expression that subscripts a dict by a tuple you
 * would have to construct, so this position is not addressable and must not claim to be. It is
 * also distinct from the key's own `$@key0`, which would otherwise collide with it.
 */
export function keyValueChild(parent: NodeId, index: number): NodeId {
  return `${parent}${OPAQUE_SEGMENT_MARKER}value${index}`;
}

/** `$@item0` — a set member. Sets are unindexed, so this is a position, not an accessor. */
export function setItemChild(parent: NodeId, index: number): NodeId {
  return `${parent}${OPAQUE_SEGMENT_MARKER}item${index}`;
}

/**
 * Whether this id is a legal access expression in its source language, and so whether the UI
 * should offer "copy path". False for anything routed through a set, dict key, or positional arg.
 */
export function isAddressable(id: NodeId): boolean {
  return !id.includes(OPAQUE_SEGMENT_MARKER);
}

/**
 * Disambiguates an id that already exists in the graph: `$["a"]` → `$["a"]~2` → `$["a"]~3`.
 *
 * Well-formed input cannot collide — dict and set semantics forbid duplicate keys — but malformed
 * input can, and dropping a node silently is worse than an ugly id plus a warning.
 */
export function disambiguate(id: NodeId, attempt: number): NodeId {
  return `${id}~${attempt}`;
}
