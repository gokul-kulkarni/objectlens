/**
 * The snapshot {@link SourceAdapter}.
 *
 * Mirrors the JSON adapter's shape — sniff, size guard, assemble — which is the point of the
 * contract: a third format is a new file that looks like this one with a different reader.
 */

import {
  buildGraph,
  MAX_INPUT_BYTES,
  parseError,
  type Diagnostic,
  type ParseContext,
  type ParseResult,
  type RawInput,
  type SourceAdapter,
} from '@objectlens/core';
import { readEnvelope } from './envelope.js';
import { sniffSnapshot } from './sniff.js';
import { validateSnapshot } from './validate.js';

export const SNAPSHOT_ADAPTER_ID = 'objectlens-snapshot';

export const snapshotAdapter: SourceAdapter = {
  id: SNAPSHOT_ADAPTER_ID,
  label: 'ObjectLens snapshot',
  extensions: ['.json'],
  mimeTypes: ['application/json'],

  sniff: sniffSnapshot,

  parse(input: RawInput, context: ParseContext = {}): ParseResult {
    const maxBytes = context.maxBytes ?? MAX_INPUT_BYTES;

    if (input.text.length > maxBytes) {
      return {
        graph: null,
        diagnostics: [
          parseError(
            `Snapshot is ${formatBytes(input.text.length)}, over the ${formatBytes(maxBytes)} limit.`,
          ),
        ],
      };
    }

    const { envelope, diagnostics: envelopeDiagnostics } = readEnvelope(input.text);

    // A rejected envelope yields no graph on purpose. Unlike a malformed repr, where salvaging
    // the readable half is a service, a snapshot we cannot version-check is one we cannot claim
    // to understand at all.
    if (envelope === null) return { graph: null, diagnostics: envelopeDiagnostics };

    const { root, diagnostics: nodeDiagnostics, truncated } = validateSnapshot(
      envelope.root,
      envelope.source,
    );

    const diagnostics: Diagnostic[] = [
      ...envelopeDiagnostics,
      // The producer's own diagnostics come first: "12 properties were not evaluated" explains an
      // absence the reader is about to notice, and it is not a complaint about the file.
      ...envelope.diagnostics,
      ...nodeDiagnostics,
    ];

    return {
      graph: buildGraph(root, envelope.source, {
        diagnostics,
        truncated: envelope.truncated || truncated,
      }),
      diagnostics,
    };
  },
};

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
