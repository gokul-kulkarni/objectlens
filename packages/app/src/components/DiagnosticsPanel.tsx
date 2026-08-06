/**
 * Parse diagnostics.
 *
 * Shown as a collapsed strip rather than a blocking error: partial input still produced a usable
 * graph, so the reader gets the graph *and* an honest account of what could not be read.
 */

import { useState } from 'react';
import type { Diagnostic, NodeId } from '@objectlens/core';

export interface DiagnosticsPanelProps {
  readonly diagnostics: readonly Diagnostic[];
  readonly onSelect: (id: NodeId) => void;
}

export function DiagnosticsPanel({ diagnostics, onSelect }: DiagnosticsPanelProps) {
  const [open, setOpen] = useState(false);

  if (diagnostics.length === 0) return null;

  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.length - errors;

  return (
    <div className="border-t border-slate-800 bg-slate-900/60 text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-800/60"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="text-slate-500">{open ? '▾' : '▸'}</span>
        {errors > 0 && <span className="text-rose-400">{errors} error{errors === 1 ? '' : 's'}</span>}
        {warnings > 0 && (
          <span className="text-amber-400">
            {warnings} warning{warnings === 1 ? '' : 's'}
          </span>
        )}
        <span className="text-slate-500">— the rest of the input was parsed normally</span>
      </button>

      {open && (
        <ul className="max-h-40 overflow-auto border-t border-slate-800">
          {diagnostics.map((diagnostic, index) => (
            <li
              key={`${diagnostic.message}-${index}`}
              className="flex gap-2 border-b border-slate-800/60 px-3 py-1 last:border-0"
            >
              <span className={diagnostic.severity === 'error' ? 'text-rose-400' : 'text-amber-400'}>
                {diagnostic.severity === 'error' ? '✕' : '!'}
              </span>
              {diagnostic.line !== undefined && (
                <span className="shrink-0 font-mono text-slate-500">
                  {diagnostic.line}:{diagnostic.column ?? 1}
                </span>
              )}
              <span className="text-slate-300">{diagnostic.message}</span>
              {diagnostic.nodeId !== undefined && (
                <button
                  type="button"
                  className="ml-auto shrink-0 text-sky-400 hover:underline"
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
