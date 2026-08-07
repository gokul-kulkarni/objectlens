/**
 * The YAML {@link SourceAdapter}.
 *
 * The same shape as the JSON adapter — sniff, size guard, assemble — which is the claim the
 * architecture makes: a new format is one of these plus a mapping, and nothing in `core`, the
 * views, or the app changes to accommodate it.
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
import { YAML_SOURCE_ID, parseYaml } from './convert.js';
import { sniffYaml } from './sniff.js';

export const yamlAdapter: SourceAdapter = {
  id: YAML_SOURCE_ID,
  label: 'YAML',
  extensions: ['.yaml', '.yml'],
  mimeTypes: ['application/yaml', 'text/yaml'],

  sniff: sniffYaml,

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

    const { root, diagnostics, truncated } = parseYaml(input.text);

    return {
      graph: buildGraph(root, YAML_SOURCE_ID, { diagnostics, truncated }),
      diagnostics,
    };
  },
};

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
