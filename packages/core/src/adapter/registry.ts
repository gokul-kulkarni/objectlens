/**
 * Adapter registration and format auto-detection.
 *
 * Detection asks every adapter how confident it is and takes the highest score, rather than
 * hardcoding a "try JSON, then Python" chain. A newly registered adapter competes on equal terms
 * with the built-in ones — which is the property that makes third-party formats work at all.
 *
 * The registry treats adapters as **untrusted**: a plugin whose `sniff` or `parse` throws yields a
 * diagnostic, not a blank page.
 */

import type { SourceId } from '../model/ids.js';
import type { Diagnostic } from '../model/diagnostics.js';
import { parseError } from '../model/diagnostics.js';
import type { Confidence, ParseContext, ParseResult, RawInput, SourceAdapter } from './types.js';

export interface Detection {
  readonly adapter: SourceAdapter;
  readonly confidence: Confidence;
}

export class SourceAdapterRegistry {
  readonly #adapters = new Map<SourceId, SourceAdapter>();

  /**
   * Registers an adapter, replacing any existing one with the same id and returning it.
   * Replacing rather than throwing keeps dev-server hot reload workable.
   */
  register(adapter: SourceAdapter): SourceAdapter | undefined {
    const previous = this.#adapters.get(adapter.id);
    this.#adapters.set(adapter.id, adapter);
    return previous;
  }

  unregister(id: SourceId): boolean {
    return this.#adapters.delete(id);
  }

  get(id: SourceId): SourceAdapter | undefined {
    return this.#adapters.get(id);
  }

  has(id: SourceId): boolean {
    return this.#adapters.has(id);
  }

  list(): readonly SourceAdapter[] {
    return [...this.#adapters.values()];
  }

  /**
   * Ranks adapters by confidence, best first, dropping anything that scores 0.
   *
   * A throwing `sniff` scores 0 rather than aborting detection — one broken plugin must not make
   * the other formats unusable.
   */
  detect(input: RawInput): readonly Detection[] {
    const detections: Detection[] = [];

    for (const adapter of this.#adapters.values()) {
      let confidence: Confidence;
      try {
        confidence = adapter.sniff(input);
      } catch {
        continue;
      }

      if (!Number.isFinite(confidence) || confidence <= 0) continue;
      detections.push({ adapter, confidence: Math.min(confidence, 1) });
    }

    return detections.sort((a, b) => b.confidence - a.confidence);
  }

  /** The best-scoring adapter, or `undefined` when nothing recognises the input. */
  detectBest(input: RawInput): SourceAdapter | undefined {
    return this.detect(input)[0]?.adapter;
  }

  /**
   * Parses with a named adapter, converting a thrown exception into a diagnostic.
   *
   * Adapters are contractually non-throwing; this is the backstop that keeps that contract's
   * violation a visible error message rather than a white screen.
   */
  async parseWith(
    id: SourceId,
    input: RawInput,
    context: ParseContext = {},
  ): Promise<ParseResult> {
    const adapter = this.#adapters.get(id);
    if (adapter === undefined) {
      return { graph: null, diagnostics: [parseError(`No adapter registered for "${id}".`)] };
    }

    try {
      return await adapter.parse(input, context);
    } catch (error) {
      return { graph: null, diagnostics: [adapterCrash(adapter, error)] };
    }
  }
}

function adapterCrash(adapter: SourceAdapter, error: unknown): Diagnostic {
  const detail = error instanceof Error ? error.message : String(error);
  return parseError(`Adapter "${adapter.label}" failed unexpectedly: ${detail}`);
}

/** The registry the app wires its built-in adapters into. */
export const sourceAdapters = new SourceAdapterRegistry();
