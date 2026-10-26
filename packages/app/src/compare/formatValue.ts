/**
 * Full-value text for the comparison's detail panel.
 *
 * A row shows a one-line preview; the detail panel shows both sides in full, so a changed
 * container can be read side by side. Output is bounded in depth and length — a selected root of
 * a 10 MB document must not produce 10 MB of text in a `<pre>`.
 */

import { formatScalar, keyLabel, preview, type Node } from '@objectlens/core';

const MAX_DEPTH = 8;
const MAX_CHARS = 20_000;
const INDENT = '  ';

export function formatValue(node: Node): string {
  const out: string[] = [];
  let length = 0;
  let truncated = false;

  const emit = (text: string) => {
    if (truncated) return;
    if (length + text.length > MAX_CHARS) {
      truncated = true;
      return;
    }
    out.push(text);
    length += text.length;
  };

  const write = (value: Node, depth: number) => {
    if (truncated) return;
    const pad = INDENT.repeat(depth + 1);
    const close = INDENT.repeat(depth);

    switch (value.kind) {
      case 'scalar':
        emit(formatScalar(value));
        return;
      case 'opaque':
        emit(value.text);
        return;
      case 'ref':
        emit(`<${preview(value)} → ${value.target}>`);
        return;
      default:
        if (depth >= MAX_DEPTH) {
          emit(preview(value));
          return;
        }
    }

    const [open, end] = brackets(value);
    const children = childEntries(value);
    if (children.length === 0) {
      emit(`${open}${end}`);
      return;
    }

    emit(`${open}\n`);
    children.forEach(([label, child], index) => {
      emit(pad);
      if (label !== null) emit(`${label}: `);
      write(child, depth + 1);
      emit(index < children.length - 1 ? ',\n' : '\n');
    });
    emit(`${close}${end}`);
  };

  write(node, 0);
  return truncated ? `${out.join('')}\n… (truncated)` : out.join('');
}

function brackets(node: Node): readonly [string, string] {
  switch (node.kind) {
    case 'map':
      return ['{', '}'];
    case 'set':
      return [`${node.typeName ?? 'set'}{`, '}'];
    case 'object':
      return [`${node.typeName ?? 'object'}(`, ')'];
    default:
      return ['[', ']'];
  }
}

/** Children as `[label, node]`; `null` labels are positional and print without one. */
function childEntries(node: Node): readonly (readonly [string | null, Node])[] {
  switch (node.kind) {
    case 'map':
      return node.entries.map((entry) => {
        const label = keyLabel(entry.key);
        const shown = entry.key.kind === 'scalar' && entry.key.scalarType === 'string' ? JSON.stringify(label) : label;
        return [shown ?? preview(entry.key), entry.value] as const;
      });
    case 'sequence':
    case 'set':
      return node.items.map((item) => [null, item] as const);
    case 'object':
      return [
        ...(node.args ?? []).map((arg) => [null, arg] as const),
        ...node.fields.map((field) => [field.name, field.value] as const),
      ];
    default:
      return [];
  }
}
