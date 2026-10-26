/**
 * App shell.
 *
 * Holds the header and the mode switcher; each mode owns its own state. A mode mounts the first
 * time it is opened and then stays mounted while hidden, so switching to Compare and back never
 * throws away a parsed graph, a diff, or a rendered document — and a visitor who never opens the
 * Markdown viewer never downloads its renderer. Panel widths are shared, so the layout does not
 * jump between modes.
 */

import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Spinner } from '@objectlens/icons';
import { ExploreMode } from './modes/ExploreMode.jsx';
import { CompareMode } from './modes/CompareMode.jsx';
import { SegmentedControl } from './components/SegmentedControl.jsx';
import { MODES, useMode, type Mode } from './state/useMode.js';
import { usePanelSizes } from './state/usePanelSizes.js';

const MarkdownMode = lazy(() => import('./modes/MarkdownMode.jsx').then((module) => ({ default: module.MarkdownMode })));

export function App() {
  const { mode, setMode } = useMode();
  const panels = usePanelSizes();
  const [visited, setVisited] = useState<ReadonlySet<Mode>>(() => new Set([mode]));

  // Recorded during render rather than in an effect, so a mode mounts on the same frame it is
  // first shown instead of flashing empty for one.
  if (!visited.has(mode)) setVisited(new Set([...visited, mode]));

  return (
    <div className="flex h-full flex-col bg-slate-900 text-[color:var(--color-ink)]">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-800 px-4 py-2">
        <h1 className="text-sm font-semibold tracking-tight">
          Object<span className="text-[color:var(--color-brand)]">Lens</span>
        </h1>
        <p className="hidden text-xs text-[color:var(--color-ink-subtle)] sm:block">
          Explore Python objects, JSON and more
        </p>

        <div className="ml-auto">
          <SegmentedControl label="Mode" options={MODES} value={mode} onChange={setMode} />
        </div>
      </header>

      <ModeFrame active={mode === 'explore'} visited={visited.has('explore')}>
        <ExploreMode panels={panels} />
      </ModeFrame>
      <ModeFrame active={mode === 'compare'} visited={visited.has('compare')}>
        <CompareMode panels={panels} />
      </ModeFrame>
      <ModeFrame active={mode === 'markdown'} visited={visited.has('markdown')}>
        <Suspense fallback={<Loading />}>
          <MarkdownMode panels={panels} />
        </Suspense>
      </ModeFrame>
    </div>
  );
}

function ModeFrame({
  active,
  visited,
  children,
}: {
  readonly active: boolean;
  readonly visited: boolean;
  readonly children: ReactNode;
}) {
  if (!visited) return null;
  return (
    <div hidden={!active} className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}

function Loading() {
  return (
    <div role="status" className="flex items-center gap-2 p-6 text-sm text-[color:var(--color-ink-subtle)]">
      <Spinner className="text-base" />
      Loading…
    </div>
  );
}
