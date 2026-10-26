/**
 * Equality keys for leaves, and canonical text for matching unlabelled positions.
 *
 * Scalars are compared by *meaning*, not spelling: `True` (Python) and `true` (JSON) are the same
 * boolean, `1.50` and `1.5` are the same float, and `.inf` (YAML) is Python's `inf`. Integers are
 * compared as exact big integers, so two bignums that differ only past `MAX_SAFE_INTEGER` still
 * compare unequal. An int and a float with the same value are *not* equal — that is a type change.
 */

import { keyLabel, type Node, type OpaqueNode, type ScalarNode } from '@objectlens/core';

/** Longest canonical text built for matching, so a huge set member cannot stall the diff. */
const MAX_CANONICAL = 2_000;

const POSITIVE_INFINITY = new Set(['inf', '+inf', 'infinity', '+infinity', '.inf', '+.inf']);
const NEGATIVE_INFINITY = new Set(['-inf', '-infinity', '-.inf']);
const NOT_A_NUMBER = new Set(['nan', '+nan', '-nan', '.nan']);

/** A string that is equal for two scalars exactly when they mean the same value. */
export function scalarKey(node: ScalarNode): string {
  switch (node.scalarType) {
    case 'string':
    case 'bytes':
      return `${node.scalarType}:${String(node.value)}`;
    case 'bool':
      return `bool:${node.value === true || node.raw?.toLowerCase() === 'true'}`;
    case 'null':
      return 'null';
    case 'int':
      return `int:${intKey(node)}`;
    case 'float':
      return `float:${floatKey(node)}`;
    case 'complex':
      return `complex:${node.raw ?? String(node.value)}`;
  }
}

function intKey(node: ScalarNode): string {
  const text = (node.raw ?? String(node.value)).replace(/_/g, '');
  try {
    return BigInt(text).toString();
  } catch {
    // Not a plain integer literal (an exotic radix or a lossy value) — fall back to its spelling.
    return text;
  }
}

function floatKey(node: ScalarNode): string {
  const text = (node.raw ?? String(node.value)).replace(/_/g, '').toLowerCase();
  if (POSITIVE_INFINITY.has(text)) return 'inf';
  if (NEGATIVE_INFINITY.has(text)) return '-inf';
  if (NOT_A_NUMBER.has(text)) return 'nan';

  const value = Number(text);
  if (Number.isNaN(value)) return text;
  return Object.is(value, -0) ? '-0' : String(value);
}

/**
 * An opaque value's text without its memory address, which differs between any two runs of the
 * same program and would otherwise make every opaque value a change.
 */
export function opaqueKey(node: OpaqueNode): string {
  const text = node.address === undefined ? node.text : node.text.split(node.address).join('');
  return `${node.typeName ?? ''}:${text}`;
}

/**
 * Text that identifies a value well enough to pair it with its counterpart — used for set
 * members and structural dict keys, which have no label to match on. Bounded in length, so it is
 * a matching heuristic rather than a proof of equality; the paired nodes are still diffed fully.
 */
export function canonicalText(node: Node): string {
  const parts: string[] = [];
  let length = 0;
  const stack: (Node | string)[] = [node];

  while (stack.length > 0 && length < MAX_CANONICAL) {
    const item = stack.pop();
    if (item === undefined) break;

    const text = typeof item === 'string' ? item : open(item, stack);
    parts.push(text);
    length += text.length;
  }

  return parts.join('');
}

/** Emits the opening text for `node` and pushes its contents (in reverse) onto `stack`. */
function open(node: Node, stack: (Node | string)[]): string {
  switch (node.kind) {
    case 'scalar':
      return scalarKey(node);
    case 'opaque':
      return opaqueKey(node);
    case 'ref':
      return '<ref>';
    case 'map': {
      // Sorted by key, so two dicts with the same entries in a different order pair up.
      const entries = [...node.entries].sort((a, b) =>
        (keyLabel(a.key) ?? '').localeCompare(keyLabel(b.key) ?? ''),
      );
      stack.push('}');
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const entry = entries[i];
        if (entry === undefined) continue;
        stack.push(entry.value, ':', entry.key, ',');
      }
      return '{';
    }
    case 'sequence':
    case 'set':
      stack.push(']');
      for (let i = node.items.length - 1; i >= 0; i -= 1) {
        const item = node.items[i];
        if (item !== undefined) stack.push(item, ',');
      }
      return node.kind === 'set' ? 'set[' : '[';
    case 'object':
      stack.push(')');
      for (let i = node.fields.length - 1; i >= 0; i -= 1) {
        const field = node.fields[i];
        if (field !== undefined) stack.push(field.value, `${field.name}=`, ',');
      }
      for (let i = (node.args?.length ?? 0) - 1; i >= 0; i -= 1) {
        const arg = node.args?.[i];
        if (arg !== undefined) stack.push(arg, ',');
      }
      return `${node.typeName ?? 'object'}(`;
  }
}
