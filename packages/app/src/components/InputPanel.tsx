/**
 * Input: paste, drop a file, or load an example.
 *
 * The format picker shows what auto-detection chose and lets the user override it — detection is
 * a heuristic over ambiguous text, so it has to be correctable rather than authoritative.
 */

import { useCallback, useRef, useState } from 'react';
import type { Detection } from '@objectlens/core';
import { FileUp, Play, Spinner } from '@objectlens/icons';
import { EXAMPLES } from '../examples.js';

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
  const [isDragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const readFile = useCallback(
    async (file: File) => {
      onChangeText(await file.text(), file.name);
    },
    [onChangeText],
  );

  return (
    <section
      className={`flex h-full flex-col gap-2 p-3 ${isDragging ? 'bg-sky-500/10' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file !== undefined) void readFile(file);
      }}
    >
      <div className="flex items-center gap-2">
        <label
          htmlFor="format"
          className="shrink-0 text-xs text-[color:var(--color-ink-subtle)]"
        >
          Format
        </label>
        <select
          id="format"
          className="min-w-0 flex-1 cursor-pointer truncate rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-[color:var(--color-ink)] transition-colors duration-150 hover:border-slate-600"
          value={adapterId ?? 'auto'}
          onChange={(event) =>
            onChangeAdapter(event.target.value === 'auto' ? null : event.target.value)
          }
        >
          <option value="auto">
            Auto{effectiveAdapterId !== null ? ` — ${labelFor(detections, effectiveAdapterId)}` : ''}
          </option>
          {detections.map(({ adapter, confidence }) => (
            <option key={adapter.id} value={adapter.id}>
              {adapter.label} ({Math.round(confidence * 100)}%)
            </option>
          ))}
        </select>

        <button
          type="button"
          title="Open a file"
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded border border-slate-700 px-2 py-1 text-xs text-[color:var(--color-ink-muted)] transition-colors duration-150 hover:bg-slate-800"
          onClick={() => fileInput.current?.click()}
        >
          <FileUp />
          Open
        </button>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) void readFile(file);
          }}
        />

        <button
          type="button"
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded bg-sky-700 px-3 py-1 text-xs font-medium text-white transition-colors duration-150 hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={text.trim() === '' || status === 'parsing'}
          onClick={onParse}
        >
          {status === 'parsing' ? <Spinner /> : <Play className="text-[9px]" />}
          {status === 'parsing' ? 'Parsing…' : 'Visualise'}
        </button>
      </div>

      <textarea
        aria-label="Object source"
        spellCheck={false}
        placeholder="Paste repr() output, pprint output, or JSON — then press Visualise (⌘⏎)"
        className="min-h-0 flex-1 resize-none rounded border border-slate-800 bg-slate-950 p-2 font-mono text-xs text-[color:var(--color-ink)] outline-none focus:border-sky-700"
        value={text}
        onChange={(event) => onChangeText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') onParse();
        }}
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
    </section>
  );
}

function labelFor(detections: readonly Detection[], id: string): string {
  return detections.find((d) => d.adapter.id === id)?.adapter.label ?? id;
}
