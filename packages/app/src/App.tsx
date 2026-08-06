/**
 * App shell.
 *
 * Holds the layout and owns the state that views share. It resolves which view to render from the
 * registry rather than importing one directly — the switcher lists whatever is registered and can
 * render the current graph, so a new view appears without this file changing.
 */

import { useMemo, type CSSProperties } from 'react';
import { InMemoryNodeSource } from '@objectlens/core';
import { views } from './registry.js';
import { useViewer } from './state/useViewer.js';
import { InputPanel } from './components/InputPanel.jsx';
import { Inspector } from './components/Inspector.jsx';
import { DiagnosticsPanel } from './components/DiagnosticsPanel.jsx';
import { ResizeHandle } from './components/ResizeHandle.jsx';
import { PANEL_LIMITS, usePanelSizes } from './state/usePanelSizes.js';

const EMPTY_MATCHES: ReadonlySet<string> = new Set();

export function App() {
  const viewer = useViewer();
  const { sizes, setPanel, adjustPanel, resetPanel } = usePanelSizes();
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
    <div className="flex h-full flex-col bg-slate-900 text-slate-200">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-800 px-4 py-2">
        <h1 className="text-sm font-semibold tracking-tight">
          Object<span className="text-sky-400">Lens</span>
        </h1>
        <p className="hidden text-xs text-slate-500 sm:block">
          Explore Python objects, JSON and more
        </p>

        {state.graph !== null && (
          <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            <span>
              {state.graph.nodesById.size.toLocaleString()} nodes · {Math.round(state.elapsedMs)} ms
            </span>
            {available.length > 1 && (
              <div className="flex overflow-hidden rounded border border-slate-700">
                {available.map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    title={view.description}
                    className={`px-2 py-0.5 ${
                      view.id === active?.id
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                    onClick={() => viewer.setView(view.id)}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      {/*
        Flex rather than grid: the panels are user-resizable, so their widths are inline styles
        driven by the drag handles. Below `lg` this stacks vertically and the handles hide, since
        dragging a divider on a phone is not a thing anyone wants to do.
      */}
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
            <input
              type="search"
              aria-label="Search"
              placeholder="Search keys and values…"
              className="min-w-0 flex-1 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs outline-none focus:border-sky-700"
              value={state.query}
              onChange={(event) => viewer.setQuery(event.target.value)}
            />
            {searchResult !== null && (
              <span className="shrink-0 text-[11px] text-slate-500">
                {searchResult.matches.size}
                {searchResult.truncated ? '+' : ''} match
                {searchResult.matches.size === 1 ? '' : 'es'}
              </span>
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

          <DiagnosticsPanel diagnostics={state.diagnostics} onSelect={viewer.select} />
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
            <p className="p-3 text-xs text-slate-500">No object loaded.</p>
          )}
        </div>
      </main>
    </div>
  );
}

function EmptyState({ status }: { readonly status: string }) {
  if (status === 'parsing') {
    return <p className="p-6 text-sm text-slate-500">Parsing…</p>;
  }

  if (status === 'failed') {
    return (
      <p className="p-6 text-sm text-rose-400">
        Nothing could be parsed from that input — see the diagnostics below.
      </p>
    );
  }

  return (
    <div className="p-6 text-sm text-slate-500">
      <p className="mb-3">
        Paste a Python <code className="text-slate-300">repr()</code> dump or some JSON on the left,
        then press <kbd className="rounded border border-slate-700 px-1">⌘⏎</kbd>.
      </p>
      <p className="text-xs">Or load one of the examples to see what it does.</p>
    </div>
  );
}
