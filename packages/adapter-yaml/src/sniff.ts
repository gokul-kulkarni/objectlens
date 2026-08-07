/**
 * YAML detection.
 *
 * The hard case is that **JSON is valid YAML**, so this adapter would happily claim `{"a": 1}` and
 * render it — correctly, but with the JSON adapter's better-fitting labels lost. So JSON-shaped
 * input is deliberately conceded, and the score comes from the things only YAML has: block
 * mappings, block sequences, document markers, anchors, comments.
 *
 * Cheap by contract: a fixed head of the input, no parsing. Fully parsing a 25 MB paste just to
 * decide who should parse it would cost more than the parse.
 */

import type { Confidence, RawInput } from '@objectlens/core';

const HEAD_BYTES = 4096;

/** `key: value` at the start of a line — the single most YAML thing there is. */
const BLOCK_MAPPING = /^[ \t]*(?:[^\s#'"[\]{},&*!|>][^:#]*|'[^']*'|"[^"]*")\s*:(?:\s|$)/m;
/** `- item` at the start of a line. */
const BLOCK_SEQUENCE = /^[ \t]*-[ \t]+\S/m;
/** `---` / `...` document markers, and the `%YAML` directive. */
const DOCUMENT_MARKER = /^(?:---|\.\.\.)(?:\s|$)/m;
const DIRECTIVE = /^%(?:YAML|TAG)\s/m;
/** Anchors, aliases, and tags: syntax JSON has no equivalent for at all. */
const ANCHOR_OR_TAG = /(?:^|[\s{[,])(?:[&*][A-Za-z0-9_-]+|!!?[A-Za-z0-9_/:.-]*)(?:\s|$|[,\]}])/m;
const COMMENT = /(?:^|\s)#[^\n]*$/m;

export function sniffYaml(input: RawInput): Confidence {
  const name = input.filename?.toLowerCase();
  if (name?.endsWith('.yaml') === true || name?.endsWith('.yml') === true) return 0.95;
  if (input.mimeType === 'application/yaml' || input.mimeType === 'text/yaml') return 0.95;

  const head = input.text.slice(0, HEAD_BYTES);
  const trimmed = head.trim();
  if (trimmed === '') return 0;

  // JSON and Python `repr()` output are both parseable as YAML — or close enough that this would
  // win by accident. Their own adapters describe them better, so bracketed input is conceded.
  const first = trimmed[0] as string;
  if (first === '{' || first === '[') return 0;

  let score = 0;
  if (DOCUMENT_MARKER.test(head)) score += 0.5;
  if (DIRECTIVE.test(head)) score += 0.5;
  if (BLOCK_MAPPING.test(head)) score += 0.45;
  // Weighted as heavily as a block mapping: a line starting `- ` at the margin is not JSON, not
  // Python, and not prose that any other adapter wants. A markdown bullet list scores here too,
  // and rendering it as a list of strings is more use than refusing it.
  if (BLOCK_SEQUENCE.test(head)) score += 0.5;
  if (ANCHOR_OR_TAG.test(head)) score += 0.2;
  if (COMMENT.test(head)) score += 0.1;

  return clamp(score);
}

function clamp(value: number): Confidence {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
