/**
 * One parsed object, explored: search, the view switcher, the active view, diagnostics, and the
 * inspector beside it.
 *
 * Everything in Explore except where the text comes from. The web app puts a paste box to its
 * left; the Orca editor feeds it the open file. It resolves which view to render from the
 * registry rather than importing one directly, so a new view appears without this file changing.
 */

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { InMemoryNodeSource } from '@objectlens/core';
import { Search, Spinner } from '@objectlens/icons';
import { views } from '../registry.js';
import type { useViewer } from '../state/useViewer.js';
import { Inspector } from './Inspector.jsx';
import { DiagnosticsPanel } from './DiagnosticsPanel.jsx';
import { ResizeHandle } from './ResizeHandle.jsx';
import { SegmentedControl } from './SegmentedControl.jsx';
import { PANEL_LIMITS, type PanelControls } from '../state/usePanelSizes.js';

const EMPTY_MATCHES: ReadonlySet<string> = new Set();

export type Viewer = ReturnType<typeof useViewer>;

export interface ObjectExplorerProps {
  readonly viewer: Viewer;
  readonly panels: PanelControls;
  /** Shown in place of a view before anything has been parsed. */
  readonly emptyHint?: ReactNode;
}

export function ObjectExplorer({ viewer, panels, emptyHint }: ObjectExplorerProps) {
  const { sizes, setPanel, adjustPanel, resetPanel } = panels;
  const { state, searchResult } = viewer;

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
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-[color:var(--color-ink-subtle)]" />
            <input
              type="search"
              aria-label="Search"
              placeholder="Search keys and values…"
              className="w-full rounded border border-line bg-surface-sunken py-1 pl-7 pr-2 text-xs transition-colors duration-150 outline-none focus:border-brand"
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
            <EmptyState status={state.status} hint={emptyHint} />
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
        className="min-h-0 shrink-0 border-t border-line lg:w-[var(--right-panel)] lg:border-t-0"
        style={{ '--right-panel': `${sizes.right}px` } as CSSProperties}
      >
        {state.graph !== null ? (
          <Inspector graph={state.graph} selection={state.selection} onSelect={viewer.select} />
        ) : (
          <p className="p-3 text-xs text-[color:var(--color-ink-subtle)]">No object loaded.</p>
        )}
      </div>
    </>
  );
}

function EmptyState({ status, hint }: { readonly status: string; readonly hint: ReactNode }) {
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

  return <div className="max-w-md p-6 text-sm text-[color:var(--color-ink-subtle)]">{hint}</div>;
}
