/**
 * Parse diagnostics.
 *
 * Shown as a collapsed strip rather than a blocking error: partial input still produced a usable
 * graph, so the reader gets the graph *and* an honest account of what could not be read.
 */

import { useState } from 'react';
import type { Diagnostic, NodeId } from '@objectlens/core';
import { ChevronDown, ChevronRight, ErrorIcon, WarningIcon } from '@objectlens/icons';

export interface DiagnosticsPanelProps {
  readonly diagnostics: readonly Diagnostic[];
  /** Whether a graph came out of the parse. Decides whether this strip reassures or explains. */
  readonly parsed: boolean;
  readonly onSelect: (id: NodeId) => void;
  /** Names the input these belong to, where a mode has more than one. */
  readonly source?: string;
}

export function DiagnosticsPanel({ diagnostics, parsed, onSelect, source }: DiagnosticsPanelProps) {
  const [open, setOpen] = useState(false);

  if (diagnostics.length === 0) return null;

  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.length - errors;

  return (
    <div className="border-t border-line bg-surface/60 text-xs">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition-colors duration-150 hover:bg-surface-raised/60"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="shrink-0 text-[color:var(--color-ink-subtle)]" />
        ) : (
          <ChevronRight className="shrink-0 text-[color:var(--color-ink-subtle)]" />
        )}
        {source !== undefined && <span className="font-medium text-[color:var(--color-ink-muted)]">{source}</span>}
        {errors > 0 && <span className="text-[color:var(--color-danger)]">{errors} error{errors === 1 ? '' : 's'}</span>}
        {warnings > 0 && (
          <span className="text-[color:var(--color-caution)]">
            {warnings} warning{warnings === 1 ? '' : 's'}
          </span>
        )}
        <span className="text-[color:var(--color-ink-subtle)]">
          {/*
            "the rest was parsed normally" is a reassurance, and it is a false one when nothing
            was parsed at all — a rejected snapshot version produces exactly that case.
          */}
          {parsed ? '— the rest of the input was parsed normally' : '— nothing could be read from this input'}
        </span>
      </button>

      {open && (
        <ul className="max-h-40 overflow-auto border-t border-line">
          {diagnostics.map((diagnostic, index) => (
            <li
              key={`${diagnostic.message}-${index}`}
              className="flex items-start gap-2 border-b border-line/60 px-3 py-1 last:border-0"
            >
              {diagnostic.severity === 'error' ? (
                <ErrorIcon
                  title="Error"
                  className="mt-0.5 shrink-0 text-[color:var(--color-danger)]"
                />
              ) : (
                <WarningIcon
                  title="Warning"
                  className="mt-0.5 shrink-0 text-[color:var(--color-caution)]"
                />
              )}
              {diagnostic.line !== undefined && (
                <span className="shrink-0 font-mono text-[color:var(--color-ink-subtle)]">
                  {diagnostic.line}:{diagnostic.column ?? 1}
                </span>
              )}
              <span className="text-[color:var(--color-ink-muted)]">{diagnostic.message}</span>
              {diagnostic.nodeId !== undefined && (
                <button
                  type="button"
                  className="ml-auto shrink-0 cursor-pointer rounded text-[color:var(--color-brand)] hover:underline"
                  onClick={() => onSelect(diagnostic.nodeId as NodeId)}
                >
                  show
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
