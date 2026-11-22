/**
 * Explore: paste or open one object, then see it as a tree or a graph.
 *
 * The paste box is this mode's own; everything to its right is `ObjectExplorer`, which the Orca
 * editor reuses with the open file in place of the paste box.
 */

import type { CSSProperties } from 'react';
import { useViewer } from '../state/useViewer.js';
import { InputPanel } from '../components/InputPanel.jsx';
import { ObjectExplorer } from '../components/ObjectExplorer.jsx';
import { ResizeHandle } from '../components/ResizeHandle.jsx';
import { PANEL_LIMITS, type PanelControls } from '../state/usePanelSizes.js';

export function ExploreMode({ panels }: { readonly panels: PanelControls }) {
  const viewer = useViewer();
  const { sizes, setPanel, adjustPanel, resetPanel } = panels;
  const { state, detections, effectiveAdapterId } = viewer;

  return (
    // Flex rather than grid: the panels are user-resizable, so their widths are inline styles
    // driven by the drag handles. Below `lg` this stacks vertically and the handles hide, since
    // dragging a divider on a phone is not a thing anyone wants to do.
    <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div
        className="min-h-0 shrink-0 border-b border-line lg:w-[var(--left-panel)] lg:border-b-0"
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

      <ObjectExplorer viewer={viewer} panels={panels} emptyHint={<PasteHint />} />
    </main>
  );
}

function PasteHint() {
  return (
    <>
      <p className="mb-3 leading-relaxed">
        Paste a Python <code className="font-mono text-[color:var(--color-node-scalar)]">repr()</code>{' '}
        dump or some JSON on the left, then press{' '}
        <kbd className="rounded border border-line-strong bg-surface-raised px-1.5 py-0.5 font-mono text-[11px] text-[color:var(--color-ink-muted)]">
          ⌘&#9166;
        </kbd>
        .
      </p>
      <p className="text-xs leading-relaxed">
        Or load one of the examples below the input — they cover cycles, bignums, and deliberately
        malformed text.
      </p>
    </>
  );
}
