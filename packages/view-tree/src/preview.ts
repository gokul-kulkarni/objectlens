/**
 * Rendering node values as text.
 *
 * Two jobs, deliberately separate: the inline value shown on a row, and the summary shown for a
 * collapsed container. Both are language-neutral — they read `kind`, `typeName` and `scalarType`,
 * never `source`. A view that switches on the source language has broken the abstraction.
 */

import { childCount, type Node, type ScalarNode } from '@objectlens/core';

/** Longest inline string before elision. Rows are one line; a 4 KB value would destroy the layout. */
const MAX_INLINE = 120;

export function formatScalar(node: ScalarNode): string {
  switch (node.scalarType) {
    case 'string':
      return quote(String(node.value));
    case 'bytes':
      return `b${quote(String(node.value))}`;
    case 'null':
      // Rendered in the source language's spelling, which typeName carries when it differs.
      return node.raw ?? 'null';
    case 'bool':
      return node.raw ?? (node.value === true ? 'true' : 'false');
    case 'int':
    case 'float':
    case 'complex':
      // `raw` is authoritative when present — it is the only correct rendering for a bignum,
      // for inf/nan, and for a value like 1.50 whose text differs from its parsed form.
      return node.raw ?? String(node.value);
  }
}

/**
 * The inline rendering for a row: a scalar's value, or a one-line summary of a container.
 */
export function preview(node: Node): string {
  switch (node.kind) {
    case 'scalar':
      return formatScalar(node);

    case 'opaque':
      return node.text;

    case 'ref':
      return node.cycle ? '↺ cycle' : '→ shared';

    case 'map':
    case 'sequence':
    case 'set':
    case 'object':
      return summarise(node);
  }
}

/** `{…} 12 keys`, `[…] 3 items`, `User(2 fields)` */
export function summarise(node: Node): string {
  const count = childCount(node);

  switch (node.kind) {
    case 'map':
      return `{…} ${plural(count, 'key', 'keys')}`;
    case 'sequence':
      return `[…] ${plural(count, 'item', 'items')}`;
    case 'set':
      return `{…} ${plural(count, 'member', 'members')}`;
    case 'object':
      return `${plural(count, 'field', 'fields')}`;
    default:
      return '';
  }
}

/** The short type chip shown beside a row. */
export function typeLabel(node: Node): string {
  if (node.typeName !== undefined && node.typeName !== '') return node.typeName;
  if (node.kind === 'scalar') return node.scalarType;
  return node.kind;
}

/** Truncates for display, keeping the elision visible rather than silently cutting. */
export function elide(text: string, max = MAX_INLINE): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… (${text.length} chars)`;
}

/** Remaining C0 controls, once \n, \r and \t have been handled by name. */
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function quote(value: string): string {
  // A row is a single line, so every control character has to become a visible escape —
  // an unescaped newline inside a string value would otherwise break the layout.
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(CONTROL_CHARS, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);

  return `'${escaped}'`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
