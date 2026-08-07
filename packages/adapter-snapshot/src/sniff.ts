/**
 * Snapshot detection.
 *
 * A snapshot is JSON, so the JSON adapter also claims it — and would happily render the envelope,
 * showing the reader `{$schema, schemaVersion, root: {…}}` instead of their object. This must
 * therefore win decisively when the marker is present and score zero when it is not; there is no
 * useful middle ground for a format that identifies itself.
 *
 * Cheap by contract: it looks at a fixed head of the input and never parses.
 */

import type { Confidence, RawInput } from '@objectlens/core';

/** Enough to clear whitespace and reach the marker in a pretty-printed file. */
const HEAD_BYTES = 512;

/** The `$schema` value written by every producer — see `docs/schema.md` §6. */
const SCHEMA_MARKER = /"\$schema"\s*:\s*"[^"]*objectlens[^"]*\/schema\//i;
/** The fallback marker, for a file whose `$schema` was stripped or reordered away. */
const VERSION_MARKER = /"schemaVersion"\s*:\s*\d/;

export function sniffSnapshot(input: RawInput): Confidence {
  const head = input.text.slice(0, HEAD_BYTES);

  // Self-identifying: no heuristic needed, and no reason to leave room for doubt.
  if (SCHEMA_MARKER.test(head)) return 1;

  // A snapshot with an unrecognised `$schema` still needs to reach this adapter, because the
  // version check produces a far better message than the JSON adapter's silent success.
  if (VERSION_MARKER.test(head) && head.trimStart().startsWith('{')) return 0.98;

  return 0;
}
