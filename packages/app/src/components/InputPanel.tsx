/**
 * Input: paste, drop a file, or load an example.
 *
 * The format picker shows what auto-detection chose and lets the user override it — detection is
 * a heuristic over ambiguous text, so it has to be correctable rather than authoritative.
 */

import type { Detection } from '@objectlens/core';
import { Play, Spinner } from '@objectlens/icons';
import { EXAMPLES } from '../examples.js';
import { SnippetPanel } from './SnippetPanel.jsx';
import { SourceEditor } from './SourceEditor.jsx';

export interface InputPanelProps {
  readonly text: string;
  readonly detections: readonly Detection[];
  readonly adapterId: string | null;
  readonly effectiveAdapterId: string | null;
  readonly status: string;
  readonly onChangeText: (text: string, filename?: string) => void;
  readonly onChangeAdapter: (adapterId: string | null) => void;
  readonly onParse: () => void;
}

export function InputPanel({
  text,
  detections,
  adapterId,
  effectiveAdapterId,
  status,
  onChangeText,
  onChangeAdapter,
  onParse,
}: InputPanelProps) {
  return (
    <section className="flex h-full flex-col gap-2 p-3">
      <SourceEditor
        idPrefix=""
        text={text}
        label="Object source"
        placeholder="Paste repr() output, pprint output, or JSON — then press Visualise (⌘⏎)"
        detections={detections}
        adapterId={adapterId}
        effectiveAdapterId={effectiveAdapterId}
        onChangeText={onChangeText}
        onChangeAdapter={onChangeAdapter}
        onSubmit={onParse}
        actions={
          <button
            type="button"
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded bg-sky-700 px-3 py-1 text-xs font-medium text-white transition-colors duration-150 hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={text.trim() === '' || status === 'parsing'}
            onClick={onParse}
          >
            {status === 'parsing' ? <Spinner /> : <Play className="text-[9px]" />}
            {status === 'parsing' ? 'Parsing…' : 'Visualise'}
          </button>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        <span className="py-0.5 text-[11px] text-[color:var(--color-ink-subtle)]">Examples:</span>
        {EXAMPLES.map((example) => (
          <button
            key={example.name}
            type="button"
            title={example.description}
            className="cursor-pointer rounded border border-slate-800 px-2 py-1 text-[11px] text-[color:var(--color-ink-subtle)] transition-colors duration-150 hover:border-slate-600 hover:text-[color:var(--color-ink)]"
            onClick={() => onChangeText(example.text)}
          >
            {example.name}
          </button>
        ))}
      </div>

      <SnippetPanel />
    </section>
  );
}
