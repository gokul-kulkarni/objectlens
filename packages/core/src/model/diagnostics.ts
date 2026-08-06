/**
 * Parse diagnostics.
 *
 * Adapters must not throw. Unparseable input becomes an `opaque` node covering the bad span plus
 * a diagnostic pointing at it — one `<User: id=1>` in a 4000-line dump must not cost the reader
 * the other 3999 lines.
 *
 * See `docs/schema.md` §5.
 */

import type { NodeId } from './ids.js';

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  readonly severity: Severity;
  readonly message: string;
  /** 1-based, to match how editors and terminals report positions. */
  readonly line?: number;
  readonly column?: number;
  /** 0-based offset into the input, for highlighting the exact span. */
  readonly offset?: number;
  readonly length?: number;
  /** The node standing in for the bad span, so the UI can jump from message to tree row. */
  readonly nodeId?: NodeId;
}

export function diagnostic(
  severity: Severity,
  message: string,
  extra: Omit<Diagnostic, 'severity' | 'message'> = {},
): Diagnostic {
  return { severity, message, ...extra };
}

export const parseError = (message: string, extra?: Omit<Diagnostic, 'severity' | 'message'>) =>
  diagnostic('error', message, extra);

export const parseWarning = (message: string, extra?: Omit<Diagnostic, 'severity' | 'message'>) =>
  diagnostic('warning', message, extra);

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

/** Converts a 0-based offset into 1-based line/column for display. */
export function positionAt(text: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lineStart = 0;

  for (let i = 0; i < clamped; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      lineStart = i + 1;
    }
  }

  return { line, column: clamped - lineStart + 1 };
}
