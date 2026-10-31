/**
 * Axis 1 of the hourglass: source format → IR.
 *
 * An adapter knows one input format and nothing about how the result will be displayed. Adding
 * YAML, Java, or a proprietary format means writing one of these and registering it; no core or
 * view code changes.
 *
 * See `docs/plugins.md` for the authoring guide.
 */

import type { SourceId } from '../model/ids.js';
import type { ObjectGraph } from '../model/graph.js';
import type { Diagnostic } from '../model/diagnostics.js';

export interface RawInput {
  readonly text: string;
  /** Present for uploads; drives extension-based sniffing. */
  readonly filename?: string;
  readonly mimeType?: string;
}

export interface ParseContext {
  /** Hard input cap. Beyond this the adapter should refuse with a diagnostic, not attempt it. */
  readonly maxBytes?: number;
  /** Node budget, so a pathological input degrades to a truncated graph instead of a hang. */
  readonly maxNodes?: number;
  readonly signal?: AbortSignal;
}

export interface ParseResult {
  /** `null` only when nothing at all could be salvaged; prefer a partial graph plus diagnostics. */
  readonly graph: ObjectGraph | null;
  readonly diagnostics: readonly Diagnostic[];
}

/** Reformatted text, or a sentence for the reader saying why the input was left alone. */
export type FormatResult = { readonly text: string } | { readonly error: string };

/** Confidence that an adapter can handle an input: 0 = certainly not, 1 = certainly yes. */
export type Confidence = number;

export interface SourceAdapter {
  /** Stable identifier, also written into every node's `source` field. */
  readonly id: SourceId;
  /** Human label for the format picker. */
  readonly label: string;
  /** File extensions including the dot, e.g. `['.json']`. */
  readonly extensions: readonly string[];
  readonly mimeTypes?: readonly string[];

  /**
   * Cheap heuristic run against every candidate input. Must be fast — it runs for every
   * registered adapter on every paste — and must not throw.
   *
   * Returning 0 removes the adapter from auto-detection; the user can still select it manually.
   */
  sniff(input: RawInput): Confidence;

  /**
   * Parse to an {@link ObjectGraph}.
   *
   * **Must not throw.** Unparseable spans become `opaque` nodes plus diagnostics, so that partial
   * input still yields a usable graph. The registry defends against violations, but an adapter
   * that relies on that has already lost the reader everything after the first bad token.
   */
  parse(input: RawInput, context: ParseContext): ParseResult | Promise<ParseResult>;

  /**
   * Optional pretty-printer, which puts a Prettify button on the editor.
   *
   * Runs on the main thread and overwrites what the reader typed, so it must be quick and must
   * refuse input it cannot rewrite faithfully. Unlike `parse`, it should not guess.
   */
  format?(text: string): FormatResult;
}
