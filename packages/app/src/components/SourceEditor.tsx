/**
 * A text source: paste, type, open or drop a file, and optionally pick its format.
 *
 * Shared by every mode — the explorer's single input, both sides of a comparison, and the
 * Markdown editor — so all of them accept input the same way. The format picker appears only when
 * `detections` is given; Markdown has one format and no use for it. Prettify appears only when the
 * active adapter can format, so a new adapter gets it by implementing `format`.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { Detection, FormatResult, SourceAdapter } from '@objectlens/core';
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
  // Keyed by the text it describes, so an edit retires the message without an effect to clear it.
  const [formatFailure, setFormatFailure] = useState<{ text: string; message: string } | null>(null);
  const formatId = `${idPrefix}format`;
  const activeAdapter = detections?.find((d) => d.adapter.id === effectiveAdapterId)?.adapter;
  const canPrettify = activeAdapter?.format !== undefined && text.trim() !== '';

  const readFile = useCallback(
    async (file: File) => {
      onChangeText(await file.text(), file.name);
    },
    [onChangeText],
  );

  const prettify = () => {
    if (activeAdapter === undefined) return;

    const result = runFormat(activeAdapter, text);
    if ('error' in result) {
      setFormatFailure({ text, message: result.error });
    } else {
      onChangeText(result.text);
    }
  };

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-2 rounded transition-colors duration-150 ${
        isDragging ? 'bg-brand/10' : ''
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
              className="min-w-0 flex-1 cursor-pointer truncate rounded border border-line-strong bg-surface-raised px-2 py-1 text-xs text-[color:var(--color-ink)] transition-colors duration-150 hover:border-line-hover"
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

        {canPrettify && (
          <button
            type="button"
            title="Rewrite the text with consistent indentation"
            className="shrink-0 cursor-pointer rounded border border-line-strong px-2 py-1 text-xs text-[color:var(--color-ink-muted)] transition-colors duration-150 hover:bg-surface-raised"
            onClick={prettify}
          >
            Prettify
          </button>
        )}

        <button
          type="button"
          title="Open a file"
          className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded border border-line-strong px-2 py-1 text-xs text-[color:var(--color-ink-muted)] transition-colors duration-150 hover:bg-surface-raised ${
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

      {formatFailure?.text === text && (
        <p role="alert" className="text-xs text-[color:var(--color-danger)]">
          {formatFailure.message}
        </p>
      )}

      <textarea
        aria-label={label}
        spellCheck={false}
        placeholder={placeholder}
        className="min-h-0 flex-1 resize-none rounded border border-line bg-surface-sunken p-2 font-mono text-xs text-[color:var(--color-ink)] outline-none focus:border-brand"
        value={text}
        onChange={(event) => onChangeText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') onSubmit?.();
        }}
      />
    </div>
  );
}

/** Adapters are untrusted, and a plugin's bug should not take the editor down with it. */
function runFormat(adapter: SourceAdapter, text: string): FormatResult {
  try {
    return adapter.format?.(text) ?? { text };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { error: `Could not format this input: ${detail}` };
  }
}

function labelFor(detections: readonly Detection[], id: string): string {
  return detections.find((d) => d.adapter.id === id)?.adapter.label ?? id;
}
