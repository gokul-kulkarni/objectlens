/**
 * Compare: two objects, in any formats, as one merged tree of differences.
 *
 * Same three-panel layout as the explorer — inputs, result, detail — and the same panel widths,
 * so moving between modes does not rearrange the screen.
 */

import type { CSSProperties, KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, Spinner, WarningIcon } from '@objectlens/icons';
import type { DiffCounts } from '@objectlens/diff';
import { CompareInputs } from '../compare/CompareInputs.jsx';
import { DiffDetail } from '../compare/DiffDetail.jsx';
import { DiffTreeView } from '../compare/DiffTreeView.jsx';
import { useCompare } from '../compare/useCompare.js';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel.jsx';
import { ResizeHandle } from '../components/ResizeHandle.jsx';
import { PANEL_LIMITS, type PanelControls } from '../state/usePanelSizes.js';

const TOOL_BUTTON =
  'flex shrink-0 cursor-pointer items-center gap-1 rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-[color:var(--color-ink-muted)] transition-colors duration-150 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40';

export function CompareMode({ panels }: { readonly panels: PanelControls }) {
  const compare = useCompare();
  const { state, index } = compare;
  const { sizes, setPanel, adjustPanel, resetPanel } = panels;
  const changeCount = index?.changes.length ?? 0;

  // `n` / `p` step through changes while the result has focus; typing in an input is left alone.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === 'n' || event.key === 'j') compare.step(1);
    if (event.key === 'p' || event.key === 'k') compare.step(-1);
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div
        className="min-h-0 shrink-0 border-b border-slate-800 lg:w-[var(--left-panel)] lg:border-b-0"
        style={{ '--left-panel': `${sizes.left}px` } as CSSProperties}
      >
        <CompareInputs
          left={state.left}
          right={state.right}
          leftDetections={compare.leftDetections}
          rightDetections={compare.rightDetections}
          leftAdapter={compare.leftAdapter}
          rightAdapter={compare.rightAdapter}
          arrayKey={state.arrayKey}
          canCompare={compare.canCompare}
          comparing={state.status === 'comparing'}
          onChangeText={compare.setText}
          onChangeAdapter={compare.setAdapter}
          onChangeArrayKey={compare.setArrayKey}
          onSwap={compare.swap}
          onLoad={compare.load}
          onCompare={compare.compare}
        />
      </div>

      <ResizeHandle
        label="Resize input panel"
        value={sizes.left}
        min={PANEL_LIMITS.left.min}
        max={PANEL_LIMITS.left.max}
        side="left"
        onResize={(width) => setPanel('left', width)}
        onAdjust={(delta) => adjustPanel('left', delta)}
        onReset={() => resetPanel('left')}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col" onKeyDown={onKeyDown}>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 px-3 py-1.5 text-xs">
          {state.diff === null ? (
            <span className="text-[color:var(--color-ink-subtle)]">No comparison yet</span>
          ) : (
            <>
              <CountChips counts={state.diff.counts} />
              <span className="tabular text-[11px] text-[color:var(--color-ink-subtle)]">
                {Math.round(state.elapsedMs)} ms
              </span>

              <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-[color:var(--color-ink-muted)]">
                <input
                  type="checkbox"
                  className="cursor-pointer accent-sky-600"
                  checked={state.onlyChanges}
                  onChange={(event) => compare.setOnlyChanges(event.target.checked)}
                />
                Only changes
              </label>
              <button type="button" className={TOOL_BUTTON} disabled={changeCount === 0} title="Previous change (p)" onClick={() => compare.step(-1)}>
                <ArrowUp />
                Prev
              </button>
              <button type="button" className={TOOL_BUTTON} disabled={changeCount === 0} title="Next change (n)" onClick={() => compare.step(1)}>
                <ArrowDown />
                Next
              </button>
              <button type="button" className={TOOL_BUTTON} onClick={compare.expandEverything}>
                Expand all
              </button>
              <button type="button" className={TOOL_BUTTON} onClick={compare.collapseAll}>
                Collapse
              </button>
            </>
          )}
        </div>

        {state.diff !== null && (state.diff.truncated || state.diff.notes.length > 0) && (
          <ul className="shrink-0 border-b border-slate-800 bg-amber-500/5 px-3 py-1 text-[11px] text-[color:var(--color-caution)]">
            {state.diff.truncated && (
              <li className="flex items-center gap-1.5">
                <WarningIcon className="shrink-0" />
                The inputs are very large, so part of the comparison was settled without walking it in full.
              </li>
            )}
            {state.diff.notes.map((note) => (
              <li key={note} className="flex items-center gap-1.5">
                <WarningIcon className="shrink-0" />
                <span className="font-mono">{note}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="min-h-0 flex-1">
          {state.diff !== null ? (
            state.diff.root.status === 'same' ? (
              <Message role="status">No differences — the two inputs hold the same data.</Message>
            ) : (
              <DiffTreeView
                diff={state.diff}
                expanded={state.expanded}
                onlyChanges={state.onlyChanges}
                selection={state.selection}
                onSelect={compare.select}
                onToggle={compare.toggleExpand}
              />
            )
          ) : (
            <EmptyState status={state.status} />
          )}
        </div>

        <DiagnosticsPanel
          source="Original"
          diagnostics={state.leftDiagnostics}
          parsed={state.status === 'ready'}
          onSelect={compare.select}
        />
        <DiagnosticsPanel
          source="Modified"
          diagnostics={state.rightDiagnostics}
          parsed={state.status === 'ready'}
          onSelect={compare.select}
        />
      </div>

      <ResizeHandle
        label="Resize detail panel"
        value={sizes.right}
        min={PANEL_LIMITS.right.min}
        max={PANEL_LIMITS.right.max}
        side="right"
        onResize={(width) => setPanel('right', width)}
        onAdjust={(delta) => adjustPanel('right', delta)}
        onReset={() => resetPanel('right')}
      />

      <div
        className="min-h-0 shrink-0 border-t border-slate-800 lg:w-[var(--right-panel)] lg:border-t-0"
        style={{ '--right-panel': `${sizes.right}px` } as CSSProperties}
      >
        <DiffDetail node={state.selection === null ? undefined : index?.byId.get(state.selection)} />
      </div>
    </main>
  );
}

function CountChips({ counts }: { readonly counts: DiffCounts }) {
  return (
    <span role="status" aria-live="polite" className="tabular flex items-center gap-1.5 text-[11px]">
      <span className="rounded bg-emerald-500/10 px-1.5 text-[color:var(--color-diff-added)]">+{counts.added} added</span>
      <span className="rounded bg-rose-500/10 px-1.5 text-[color:var(--color-diff-removed)]">−{counts.removed} removed</span>
      <span className="rounded bg-amber-500/10 px-1.5 text-[color:var(--color-diff-changed)]">~{counts.changed} changed</span>
    </span>
  );
}

function Message({ role, children }: { readonly role: 'status' | 'alert'; readonly children: React.ReactNode }) {
  return (
    <p role={role} className={`p-6 text-sm ${role === 'alert' ? 'text-[color:var(--color-danger)]' : 'text-[color:var(--color-ink-subtle)]'}`}>
      {children}
    </p>
  );
}

function EmptyState({ status }: { readonly status: string }) {
  if (status === 'comparing') {
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-2 p-6 text-sm text-[color:var(--color-ink-subtle)]">
        <Spinner className="text-base" />
        Comparing…
      </div>
    );
  }

  if (status === 'failed') {
    return <Message role="alert">One of the inputs could not be parsed — see the diagnostics below.</Message>;
  }

  return (
    <div className="max-w-md p-6 text-sm leading-relaxed text-[color:var(--color-ink-subtle)]">
      <p className="mb-3">
        Paste two objects on the left — JSON, YAML, Python <code className="font-mono">repr()</code>, in any
        combination — and press Compare.
      </p>
      <p className="text-xs">
        They are compared on meaning, not text: key order, number spelling and the source format do
        not count as differences. To match reordered records, give the field that identifies them.
      </p>
    </div>
  );
}
