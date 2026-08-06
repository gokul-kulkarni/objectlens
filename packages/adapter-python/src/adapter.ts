/**
 * The Python `repr()` {@link SourceAdapter}.
 *
 * Deliberately near-identical to the JSON adapter: sniffing, size guarding, and graph assembly
 * here, grammar in `lexer.ts`/`parser.ts`. That similarity is the contract working — a new format
 * copies this file and swaps the parser.
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
import { PYTHON_SOURCE_ID, parsePython } from './parser.js';
import { sniffPython } from './sniff.js';

export const pythonAdapter: SourceAdapter = {
  id: PYTHON_SOURCE_ID,
  label: 'Python repr()',
  extensions: ['.py', '.repr'],
  mimeTypes: ['text/x-python'],

  sniff: sniffPython,

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

    const { root, diagnostics, truncated } = parsePython(input.text);

    return {
      graph: buildGraph(root, PYTHON_SOURCE_ID, { diagnostics, truncated }),
      diagnostics,
    };
  },
};

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
