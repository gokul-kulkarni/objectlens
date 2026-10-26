/**
 * A text source: paste, type, open or drop a file, and optionally pick its format.
 *
 * Shared by every mode — the explorer's single input, both sides of a comparison, and the
 * Markdown editor — so all of them accept input the same way. The format picker appears only when
 * `detections` is given; Markdown has one format and no use for it.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { Detection } from '@objectlens/core';
import { FileUp } from '@objectlens/icons';

export interface SourceEditorProps {
  /** Prefix for element ids, so two editors on one page do not share a `<label for>`. */
  readonly idPrefix: string;
  readonly text: string;
  /** Accessible name of the textarea. */
  readonly label: string;
  readonly placeholder: string;
  /** Optional caption shown at the start of the toolbar, e.g. "Original". */
  readonly title?: string;
  readonly detections?: readonly Detection[];
  readonly adapterId?: string | null;
  readonly effectiveAdapterId?: string | null;
  /** `accept` for the file picker, e.g. `.md,.markdown`. */
  readonly accept?: string;
  /** Buttons placed at the end of the toolbar — the mode's primary action. */
  readonly actions?: ReactNode;
  readonly onChangeText: (text: string, filename?: string) => void;
  readonly onChangeAdapter?: (adapterId: string | null) => void;
  /** Fired on ⌘⏎ / Ctrl⏎. */
  readonly onSubmit?: () => void;
}

export function SourceEditor({
  idPrefix,
  text,
  label,
  placeholder,
  title,
  detections,
  adapterId = null,
  effectiveAdapterId = null,
  accept,
  actions,
  onChangeText,
  onChangeAdapter,
  onSubmit,
}: SourceEditorProps) {
  const [isDragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const formatId = `${idPrefix}format`;

  const readFile = useCallback(
    async (file: File) => {
      onChangeText(await file.text(), file.name);
    },
    [onChangeText],
  );

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-2 rounded transition-colors duration-150 ${
        isDragging ? 'bg-sky-500/10' : ''
      }`}
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
        {title !== undefined && (
          <span className="shrink-0 text-xs font-medium text-[color:var(--color-ink-muted)]">{title}</span>
        )}

        {detections !== undefined && onChangeAdapter !== undefined && (
          <>
            <label htmlFor={formatId} className="shrink-0 text-xs text-[color:var(--color-ink-subtle)]">
              Format
            </label>
            <select
              id={formatId}
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
          </>
        )}

        <button
          type="button"
          title="Open a file"
          className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded border border-slate-700 px-2 py-1 text-xs text-[color:var(--color-ink-muted)] transition-colors duration-150 hover:bg-slate-800 ${
            detections === undefined ? 'ml-auto' : ''
          }`}
          onClick={() => fileInput.current?.click()}
        >
          <FileUp />
          Open
        </button>
        <input
          ref={fileInput}
          type="file"
          data-testid={`${idPrefix}file`}
          className="hidden"
          {...(accept === undefined ? {} : { accept })}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) void readFile(file);
          }}
        />

        {actions}
      </div>

      <textarea
        aria-label={label}
        spellCheck={false}
        placeholder={placeholder}
        className="min-h-0 flex-1 resize-none rounded border border-slate-800 bg-slate-950 p-2 font-mono text-xs text-[color:var(--color-ink)] outline-none focus:border-sky-700"
        value={text}
        onChange={(event) => onChangeText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') onSubmit?.();
        }}
      />
    </div>
  );
}

function labelFor(detections: readonly Detection[], id: string): string {
  return detections.find((d) => d.adapter.id === id)?.adapter.label ?? id;
}
