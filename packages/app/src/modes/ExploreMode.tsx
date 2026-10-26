/**
 * Explore: one object, as a tree or a graph.
 *
 * Owns the state that views share. It resolves which view to render from the registry rather
 * than importing one directly — the switcher lists whatever is registered and can render the
 * current graph, so a new view appears without this file changing.
 */

import { useMemo, type CSSProperties } from 'react';
import { InMemoryNodeSource } from '@objectlens/core';
import { Search, Spinner } from '@objectlens/icons';
import { views } from '../registry.js';
import { useViewer } from '../state/useViewer.js';
import { InputPanel } from '../components/InputPanel.jsx';
import { Inspector } from '../components/Inspector.jsx';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel.jsx';
import { ResizeHandle } from '../components/ResizeHandle.jsx';
import { SegmentedControl } from '../components/SegmentedControl.jsx';
import { PANEL_LIMITS, type PanelControls } from '../state/usePanelSizes.js';

const EMPTY_MATCHES: ReadonlySet<string> = new Set();

export function ExploreMode({ panels }: { readonly panels: PanelControls }) {
  const viewer = useViewer();
  const { sizes, setPanel, adjustPanel, resetPanel } = panels;
  const { state, detections, effectiveAdapterId, searchResult } = viewer;

  const nodeSource = useMemo(
    () => (state.graph === null ? null : new InMemoryNodeSource(state.graph)),
    [state.graph],
  );

  const available = useMemo(
    () => (state.graph === null ? [] : views.available(state.graph)),
    [state.graph],
  );

  const active = available.find((view) => view.id === state.viewId) ?? available[0];

  return (
    // Flex rather than grid: the panels are user-resizable, so their widths are inline styles
    // driven by the drag handles. Below `lg` this stacks vertically and the handles hide, since
    // dragging a divider on a phone is not a thing anyone wants to do.
    <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div
        className="min-h-0 shrink-0 border-b border-slate-800 lg:w-[var(--left-panel)] lg:border-b-0"
        style={{ '--left-panel': `${sizes.left}px` } as CSSProperties}
      >
        <InputPanel
          text={state.text}
          detections={detections}
          adapterId={state.adapterId}
          effectiveAdapterId={effectiveAdapterId}
          status={state.status}
          onChangeText={viewer.setInput}
          onChangeAdapter={viewer.setAdapter}
          onParse={viewer.parse}
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-[color:var(--color-ink-subtle)]" />
            <input
              type="search"
              aria-label="Search"
              placeholder="Search keys and values…"
              className="w-full rounded border border-slate-800 bg-slate-950 py-1 pl-7 pr-2 text-xs transition-colors duration-150 outline-none focus:border-sky-700"
              value={state.query}
              onChange={(event) => viewer.setQuery(event.target.value)}
            />
          </div>
          {searchResult !== null && (
            <span
              role="status"
              aria-live="polite"
              className="tabular shrink-0 text-[11px] text-[color:var(--color-ink-subtle)]"
            >
              {searchResult.matches.size}
              {searchResult.truncated ? '+' : ''} match
              {searchResult.matches.size === 1 ? '' : 'es'}
            </span>
          )}

          {state.graph !== null && (
            <span className="tabular hidden shrink-0 text-[11px] text-[color:var(--color-ink-subtle)] md:inline">
              {state.graph.nodesById.size.toLocaleString()} nodes · {Math.round(state.elapsedMs)} ms
            </span>
          )}
          {available.length > 1 && active !== undefined && (
            <SegmentedControl
              label="View"
              options={available.map((view) => ({
                id: view.id,
                label: view.label,
                ...(view.description === undefined ? {} : { description: view.description }),
              }))}
              value={active.id}
              onChange={viewer.setView}
            />
          )}
        </div>

        <div className="min-h-0 flex-1">
          {state.graph !== null && nodeSource !== null && active !== undefined ? (
            <active.Component
              graph={state.graph}
              nodeSource={nodeSource}
              selection={state.selection}
              onSelect={viewer.select}
              expanded={state.expanded}
              onToggleExpand={viewer.toggleExpand}
              query={state.query}
              matches={searchResult?.matches ?? EMPTY_MATCHES}
            />
          ) : (
            <EmptyState status={state.status} />
          )}
        </div>

        <DiagnosticsPanel
          diagnostics={state.diagnostics}
          parsed={state.graph !== null}
          onSelect={viewer.select}
        />
      </div>

      <ResizeHandle
        label="Resize inspector panel"
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
        {state.graph !== null ? (
          <Inspector graph={state.graph} selection={state.selection} onSelect={viewer.select} />
        ) : (
          <p className="p-3 text-xs text-[color:var(--color-ink-subtle)]">No object loaded.</p>
        )}
      </div>
    </main>
  );
}

function EmptyState({ status }: { readonly status: string }) {
  if (status === 'parsing') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 p-6 text-sm text-[color:var(--color-ink-subtle)]"
      >
        <Spinner className="text-base" />
        Parsing…
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <p role="alert" className="p-6 text-sm text-[color:var(--color-danger)]">
        Nothing could be parsed from that input — see the diagnostics below.
      </p>
    );
  }

  return (
    <div className="max-w-md p-6 text-sm text-[color:var(--color-ink-subtle)]">
      <p className="mb-3 leading-relaxed">
        Paste a Python <code className="font-mono text-[color:var(--color-node-scalar)]">repr()</code>{' '}
        dump or some JSON on the left, then press{' '}
        <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-[color:var(--color-ink-muted)]">
          ⌘&#9166;
        </kbd>
        .
      </p>
      <p className="text-xs leading-relaxed">
        Or load one of the examples below the input — they cover cycles, bignums, and deliberately
        malformed text.
      </p>
    </div>
  );
}
