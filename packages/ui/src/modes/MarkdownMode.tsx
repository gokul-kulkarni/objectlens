/**
 * Markdown: read a README — pasted, opened, or fetched — with Mermaid diagrams drawn.
 *
 * Source on the left, document in the middle, outline on the right: the same three panels and
 * widths as the other modes.
 */

import { useCallback, useRef, type CSSProperties } from 'react';
import { LinkIcon, Spinner } from '@objectlens/icons';
import { ResizeHandle } from '../components/ResizeHandle.jsx';
import { SegmentedControl } from '../components/SegmentedControl.jsx';
import { SourceEditor } from '../components/SourceEditor.jsx';
import { MARKDOWN_EXAMPLES } from '../examples.js';
import { MarkdownPreview } from '../markdown/MarkdownPreview.jsx';
import { useMarkdown } from '../markdown/useMarkdown.js';
import { PREVIEW_WIDTHS, usePreviewWidth } from '../markdown/usePreviewWidth.js';
import type { Heading } from '../markdown/render.js';
import { PANEL_LIMITS, type PanelControls } from '../state/usePanelSizes.js';

export function MarkdownMode({ panels }: { readonly panels: PanelControls }) {
  const markdown = useMarkdown();
  const { width, setWidth } = usePreviewWidth();
  const { sizes, setPanel, adjustPanel, resetPanel } = panels;
  const previewRef = useRef<HTMLDivElement>(null);
  const { segments, headings } = markdown.rendered;

  const navigate = useCallback((id: string) => {
    const target = previewRef.current?.querySelector(`[id="${CSS.escape(id)}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div
        className="min-h-0 shrink-0 border-b border-line lg:w-[var(--left-panel)] lg:border-b-0"
        style={{ '--left-panel': `${sizes.left}px` } as CSSProperties}
      >
        <section className="flex h-full flex-col gap-2 p-3">
          <form
            className="flex shrink-0 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void markdown.load();
            }}
          >
            <div className="relative min-w-0 flex-1">
              <LinkIcon className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-[color:var(--color-ink-subtle)]" />
              <input
                // Not `type="url"`: native validation would silently refuse `github.com/o/r`,
                // which has no scheme and is exactly what people paste.
                type="text"
                inputMode="url"
                spellCheck={false}
                autoComplete="off"
                aria-label="Markdown URL"
                placeholder="github.com/owner/repo, or a link to a .md file"
                className="w-full rounded border border-line bg-surface-sunken py-1 pl-7 pr-2 text-xs outline-none transition-colors duration-150 focus:border-brand"
                value={markdown.url}
                onChange={(event) => markdown.setUrl(event.target.value)}
              />
            </div>
            <button
              type="submit"
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded bg-brand px-3 py-1 text-xs font-medium text-brand-ink transition-colors duration-150 hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
              disabled={markdown.url.trim() === '' || markdown.status.state === 'loading'}
            >
              {markdown.status.state === 'loading' && <Spinner />}
              {markdown.status.state === 'loading' ? 'Loading…' : 'Load'}
            </button>
          </form>
          {markdown.status.state === 'error' ? (
            <p role="alert" className="shrink-0 text-[11px] text-[color:var(--color-danger)]">
              {markdown.status.message}
            </p>
          ) : (
            <p className="shrink-0 text-[11px] text-[color:var(--color-ink-subtle)]">
              Loading fetches that one URL from your browser. Pasted and opened files never leave it.
            </p>
          )}

          <SourceEditor
            idPrefix="markdown-"
            title={markdown.label ?? undefined}
            text={markdown.text}
            label="Markdown source"
            placeholder="Paste Markdown, or open or drop a .md file"
            accept=".md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain"
            onChangeText={markdown.setText}
          />

          <div className="flex shrink-0 flex-wrap gap-1.5">
            <span className="py-0.5 text-[11px] text-[color:var(--color-ink-subtle)]">Examples:</span>
            {MARKDOWN_EXAMPLES.map((example) => (
              <button
                key={example.name}
                type="button"
                title={example.description}
                className="cursor-pointer rounded border border-line px-2 py-1 text-[11px] text-[color:var(--color-ink-subtle)] transition-colors duration-150 hover:border-line-hover hover:text-[color:var(--color-ink)]"
                onClick={() => markdown.loadText(example.text, example.name)}
              >
                {example.name}
              </button>
            ))}
          </div>
        </section>
      </div>

      <ResizeHandle
        label="Resize source panel"
        value={sizes.left}
        min={PANEL_LIMITS.left.min}
        max={PANEL_LIMITS.left.max}
        side="left"
        onResize={(width) => setPanel('left', width)}
        onAdjust={(delta) => adjustPanel('left', delta)}
        onReset={() => resetPanel('left')}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate text-xs text-[color:var(--color-ink-subtle)]">
            {markdown.label ?? 'Preview'}
          </span>
          <span className="text-[11px] text-[color:var(--color-ink-subtle)]">Width</span>
          <SegmentedControl label="Preview width" options={PREVIEW_WIDTHS} value={width} onChange={setWidth} />
        </div>

        <div ref={previewRef} className="min-h-0 min-w-0 flex-1 overflow-auto" data-testid="markdown-scroll">
          {markdown.text.trim() === '' ? (
            <div className="max-w-md p-6 text-sm leading-relaxed text-[color:var(--color-ink-subtle)]">
              <p className="mb-3">Paste Markdown on the left, open a file, or load a README from GitHub.</p>
              <p className="text-xs">
                Tables, task lists and highlighted code render as they do on GitHub, and{' '}
                <code className="font-mono">```mermaid</code> blocks are drawn as diagrams.
              </p>
            </div>
          ) : (
            <MarkdownPreview segments={segments} onNavigate={navigate} width={width} />
          )}
        </div>
      </div>

      <ResizeHandle
        label="Resize outline panel"
        value={sizes.right}
        min={PANEL_LIMITS.right.min}
        max={PANEL_LIMITS.right.max}
        side="right"
        onResize={(width) => setPanel('right', width)}
        onAdjust={(delta) => adjustPanel('right', delta)}
        onReset={() => resetPanel('right')}
      />

      <div
        className="min-h-0 shrink-0 overflow-auto border-t border-line lg:w-[var(--right-panel)] lg:border-t-0"
        style={{ '--right-panel': `${sizes.right}px` } as CSSProperties}
      >
        <Outline headings={headings} onNavigate={navigate} />
      </div>
    </main>
  );
}

function Outline({ headings, onNavigate }: { readonly headings: readonly Heading[]; readonly onNavigate: (id: string) => void }) {
  if (headings.length === 0) {
    return <p className="p-3 text-xs text-[color:var(--color-ink-subtle)]">No headings.</p>;
  }

  const top = Math.min(...headings.map((heading) => heading.depth));

  return (
    <nav aria-label="Outline" className="p-3 text-xs">
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-subtle)]">
        Outline
      </h2>
      <ul>
        {headings.map((heading) => (
          <li key={heading.id} style={{ paddingLeft: (heading.depth - top) * 12 }}>
            <button
              type="button"
              className="w-full cursor-pointer truncate rounded px-1 py-0.5 text-left text-[color:var(--color-ink-muted)] transition-colors duration-150 hover:bg-surface-raised hover:text-[color:var(--color-ink)]"
              title={heading.text}
              onClick={() => onNavigate(heading.id)}
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
