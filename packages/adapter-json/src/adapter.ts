/**
 * The JSON {@link SourceAdapter}.
 *
 * Thin by design: sniffing, size guarding, and graph assembly live here, while the actual grammar
 * is in `lexer.ts`/`parser.ts`. A new format adapter should be able to copy this file almost
 * verbatim and swap the parser — that similarity is the point of the contract.
 */

import {
  buildGraph,
  MAX_INPUT_BYTES,
  parseError,
  type ParseContext,
  type ParseResult,
  type RawInput,
  type SourceAdapter,
} from '@objectlens/core';
import { JSON_SOURCE_ID, parseJson } from './parser.js';
import { sniffJson } from './sniff.js';

export const jsonAdapter: SourceAdapter = {
  id: JSON_SOURCE_ID,
  label: 'JSON',
  extensions: ['.json'],
  mimeTypes: ['application/json'],

  sniff: sniffJson,

  parse(input: RawInput, context: ParseContext = {}): ParseResult {
    const maxBytes = context.maxBytes ?? MAX_INPUT_BYTES;

    if (input.text.length > maxBytes) {
      return {
        graph: null,
        diagnostics: [
          parseError(
            `Input is ${formatBytes(input.text.length)}, over the ${formatBytes(maxBytes)} limit.`,
          ),
        ],
      };
    }

    if (input.text.trim() === '') {
      return { graph: null, diagnostics: [parseError('Input is empty.')] };
    }

    const { root, diagnostics, truncated } = parseJson(input.text);

    return {
      graph: buildGraph(root, JSON_SOURCE_ID, { diagnostics, truncated }),
      diagnostics,
    };
  },
};

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
